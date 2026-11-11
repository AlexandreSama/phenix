import type {
  Prisma,
  PrismaClient,
  Td2ActivityKind,
  Td2Difficulty,
  Td2Role,
  Td2SignupStatus,
} from './generated/prisma/client.js';

type Db = Pick<PrismaClient, 'td2ActivityMode' | 'td2Event'>;
type TxDb = Pick<PrismaClient, '$transaction'>;

/** Les activités actives d'un type, avec leurs modes et compositions : ce que propose l'autocomplétion. */
export function listTd2Activities(db: Pick<PrismaClient, 'td2Activity'>, kind: Td2ActivityKind) {
  return db.td2Activity.findMany({
    where: { kind, active: true },
    include: { modes: { orderBy: { name: 'asc' }, include: { slots: true } } },
    orderBy: { name: 'asc' },
  });
}

const EVENT_DETAILS = {
  mode: { include: { activity: true } },
  slots: true,
  // L'ordre d'inscription décide de l'ordre de passage de la réserve
  signups: { orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.Td2EventInclude;

/** Une sortie avec son activité (aucune pour une mission), sa composition et ses inscrits. */
export type Td2EventDetails = Prisma.Td2EventGetPayload<{ include: typeof EVENT_DETAILS }>;

/** Le type d'une sortie : celui de son activité, ou « mission », qui n'en a pas. */
export type Td2EventKind = Td2ActivityKind | 'MISSION';

export const td2EventKind = (event: {
  mode: { activity: { kind: Td2ActivityKind } } | null;
}): Td2EventKind => event.mode?.activity.kind ?? 'MISSION';

export interface NewTd2Event {
  guildId: string;
  modeId: number;
  scheduledAt: Date;
  channelId: string;
  organizerId: string;
}

/**
 * Crée la sortie en copiant la composition du mode. Une composition modifiée plus tard dans
 * le catalogue ne touche pas les sorties déjà prévues. Renvoie null si le mode n'existe plus.
 */
export async function createTd2Event(db: Db, data: NewTd2Event): Promise<Td2EventDetails | null> {
  const mode = await db.td2ActivityMode.findUnique({
    where: { id: data.modeId },
    include: { slots: true, activity: true },
  });
  if (!mode?.activity.active) return null;
  return db.td2Event.create({
    data: {
      ...data,
      slots: { create: mode.slots.map(({ role, count }) => ({ role, count })) },
    },
    include: EVENT_DETAILS,
  });
}

export interface NewTd2Mission {
  guildId: string;
  /** Le nom choisi par l'organisateur : une mission n'est pas dans le catalogue */
  missionName: string;
  difficulty: Td2Difficulty;
  /** Le nombre de places, de 1 à 4 : une mission se joue sans rôles */
  players: number;
  scheduledAt: Date;
  channelId: string;
  organizerId: string;
}

/** Crée une mission : une seule sorte de place (« joueur »), sans directive pour commencer. */
export function createTd2Mission(
  db: Pick<PrismaClient, 'td2Event'>,
  { players, ...data }: NewTd2Mission,
): Promise<Td2EventDetails> {
  return db.td2Event.create({
    data: { ...data, slots: { create: [{ role: 'PLAYER', count: players }] } },
    include: EVENT_DETAILS,
  });
}

export function findTd2Event(db: Pick<PrismaClient, 'td2Event'>, id: number) {
  return db.td2Event.findUnique({ where: { id }, include: EVENT_DETAILS });
}

type LockedEvent = { scheduledAt: Date; cancelledAt: Date | null; modeId: number | null };

/**
 * Verrouille la sortie jusqu'à la fin de la transaction : les inscriptions d'une même sortie
 * passent une par une, deux joueurs ne peuvent pas prendre la dernière place en même temps.
 */
async function lockEvent(tx: Prisma.TransactionClient, id: number) {
  const rows = await tx.$queryRaw<LockedEvent[]>`
    SELECT "scheduledAt", "cancelledAt", "modeId" FROM "Td2Event" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0];
}

const isClosed = (row: LockedEvent, now: Date) =>
  row.cancelledAt !== null || row.scheduledAt.getTime() <= now.getTime();

export interface Td2Promotion {
  userId: string;
  role: Td2Role;
}

/** Fait monter le premier de la réserve de ce rôle, s'il reste une place. */
async function promoteNext(
  tx: Prisma.TransactionClient,
  eventId: number,
  role: Td2Role,
): Promise<Td2Promotion[]> {
  const slot = await tx.td2EventSlot.findUnique({ where: { eventId_role: { eventId, role } } });
  const confirmed = await tx.td2Signup.count({ where: { eventId, role, status: 'CONFIRMED' } });
  if (!slot || confirmed >= slot.count) return [];
  const next = await tx.td2Signup.findFirst({
    where: { eventId, role, status: 'RESERVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!next) return [];
  await tx.td2Signup.update({
    where: { eventId_userId: { eventId, userId: next.userId } },
    data: { status: 'CONFIRMED' },
  });
  return [{ userId: next.userId, role }];
}

export type Td2JoinResult =
  | { status: 'missing' | 'closed' | 'no-slot' }
  | { status: 'already'; role: Td2Role; signupStatus: Td2SignupStatus }
  | {
      status: 'joined';
      role: Td2Role;
      signupStatus: Td2SignupStatus;
      /** Le rôle quitté, quand le joueur change de rôle */
      previousRole: Td2Role | null;
      /** Ceux qui montent de la réserve grâce à la place libérée */
      promoted: Td2Promotion[];
    };

/**
 * Inscrit un joueur dans un rôle : confirmé s'il reste une place, en réserve sinon.
 * Déjà inscrit dans un autre rôle, il change de rôle et libère sa place.
 */
export function joinTd2Event(
  db: TxDb,
  eventId: number,
  userId: string,
  role: Td2Role,
  now = new Date(),
): Promise<Td2JoinResult> {
  return db.$transaction(async (tx) => {
    const row = await lockEvent(tx, eventId);
    if (!row) return { status: 'missing' };
    if (isClosed(row, now)) return { status: 'closed' };

    const slot = await tx.td2EventSlot.findUnique({ where: { eventId_role: { eventId, role } } });
    if (!slot) return { status: 'no-slot' };

    const existing = await tx.td2Signup.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (existing?.role === role) {
      return { status: 'already', role, signupStatus: existing.status };
    }

    const promoted: Td2Promotion[] = [];
    if (existing) {
      await tx.td2Signup.delete({ where: { eventId_userId: { eventId, userId } } });
      if (existing.status === 'CONFIRMED') {
        promoted.push(...(await promoteNext(tx, eventId, existing.role)));
      }
    }

    const confirmed = await tx.td2Signup.count({ where: { eventId, role, status: 'CONFIRMED' } });
    const signupStatus: Td2SignupStatus = confirmed < slot.count ? 'CONFIRMED' : 'RESERVE';
    await tx.td2Signup.create({ data: { eventId, userId, role, status: signupStatus } });
    return {
      status: 'joined',
      role,
      signupStatus,
      previousRole: existing?.role ?? null,
      promoted,
    };
  });
}

export type Td2LeaveResult =
  | { status: 'missing' | 'closed' | 'not-signed' }
  | { status: 'left'; role: Td2Role; promoted: Td2Promotion[] };

/** Désinscrit un joueur ; sa place confirmée passe au premier de la réserve. */
export function leaveTd2Event(
  db: TxDb,
  eventId: number,
  userId: string,
  now = new Date(),
): Promise<Td2LeaveResult> {
  return db.$transaction(async (tx) => {
    const row = await lockEvent(tx, eventId);
    if (!row) return { status: 'missing' };
    if (isClosed(row, now)) return { status: 'closed' };

    const existing = await tx.td2Signup.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!existing) return { status: 'not-signed' };
    await tx.td2Signup.delete({ where: { eventId_userId: { eventId, userId } } });
    const promoted =
      existing.status === 'CONFIRMED' ? await promoteNext(tx, eventId, existing.role) : [];
    return { status: 'left', role: existing.role, promoted };
  });
}

/** Change la date d'une sortie pas encore commencée. 'closed' : annulée ou déjà commencée. */
export function rescheduleTd2Event(
  db: TxDb,
  id: number,
  scheduledAt: Date,
  now = new Date(),
): Promise<Td2EventDetails | 'closed' | null> {
  return db.$transaction(async (tx) => {
    const row = await lockEvent(tx, id);
    if (!row) return null;
    if (isClosed(row, now)) return 'closed';
    return tx.td2Event.update({ where: { id }, data: { scheduledAt }, include: EVENT_DETAILS });
  });
}

/** Annule une sortie pas encore commencée. Une seconde annulation répond 'closed'. */
export function cancelTd2Event(
  db: TxDb,
  id: number,
  now = new Date(),
): Promise<Td2EventDetails | 'closed' | null> {
  return db.$transaction(async (tx) => {
    const row = await lockEvent(tx, id);
    if (!row) return null;
    if (isClosed(row, now)) return 'closed';
    return tx.td2Event.update({
      where: { id },
      data: { cancelledAt: now },
      include: EVENT_DETAILS,
    });
  });
}

/**
 * Remplace les directives d'une mission pas encore commencée. Seules les directives actives
 * comptent ; leurs noms sont copiés, par ordre alphabétique.
 * 'not-mission' : un raid ou une incursion, dont la difficulté ne se règle pas ici.
 */
export function setTd2EventDirectives(
  db: TxDb,
  id: number,
  directiveIds: number[],
  now = new Date(),
): Promise<Td2EventDetails | 'closed' | 'not-mission' | null> {
  return db.$transaction(async (tx) => {
    const row = await lockEvent(tx, id);
    if (!row) return null;
    if (isClosed(row, now)) return 'closed';
    if (row.modeId !== null) return 'not-mission';
    const directives = await tx.td2Directive.findMany({
      where: { id: { in: directiveIds }, active: true },
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    return tx.td2Event.update({
      where: { id },
      data: { directives: directives.map((directive) => directive.name) },
      include: EVENT_DETAILS,
    });
  });
}

export async function markTd2EventPublished(
  db: Pick<PrismaClient, 'td2Event'>,
  id: number,
  messageId: string,
): Promise<void> {
  await db.td2Event.updateMany({ where: { id }, data: { messageId } });
}

/** Retire une sortie dont le message n'a pas pu être posté : personne ne pourrait s'y inscrire. */
export async function deleteTd2Event(
  db: Pick<PrismaClient, 'td2Event'>,
  id: number,
): Promise<void> {
  await db.td2Event.deleteMany({ where: { id } });
}

/** Au démarrage du bot : les sorties à venir, dont il faut (re)planifier le rappel et la fermeture. */
export function findTd2EventsToResume(
  db: Pick<PrismaClient, 'td2Event'>,
  guildIds: string[],
  now = new Date(),
) {
  return db.td2Event.findMany({
    where: { guildId: { in: guildIds }, cancelledAt: null, scheduledAt: { gt: now } },
    select: { id: true, scheduledAt: true },
  });
}

export interface Td2EventOverview {
  id: number;
  kind: Td2EventKind;
  /** L'activité (« Dark Hours »), ou le nom donné à la mission */
  activity: string;
  /** Le mode de l'activité ; null pour une mission */
  mode: string | null;
  /** Mission : sa difficulté et ses directives */
  difficulty: Td2Difficulty | null;
  directives: string[];
  scheduledAt: Date;
  channelId: string;
  confirmed: number;
  capacity: number;
  reserve: number;
}

const OVERVIEW = {
  mode: { include: { activity: true } },
  slots: true,
  signups: { select: { status: true } },
} as const satisfies Prisma.Td2EventInclude;

function toOverview(
  event: Prisma.Td2EventGetPayload<{ include: typeof OVERVIEW }>,
): Td2EventOverview {
  return {
    id: event.id,
    kind: td2EventKind(event),
    activity: event.mode?.activity.name ?? event.missionName ?? 'Mission',
    mode: event.mode?.name ?? null,
    difficulty: event.difficulty,
    directives: event.directives,
    scheduledAt: event.scheduledAt,
    channelId: event.channelId,
    confirmed: event.signups.filter((signup) => signup.status === 'CONFIRMED').length,
    capacity: event.slots.reduce((total, slot) => total + slot.count, 0),
    reserve: event.signups.filter((signup) => signup.status === 'RESERVE').length,
  };
}

/** Les sorties à venir d'un serveur, la plus proche d'abord, avec leur remplissage. */
export async function listUpcomingTd2Events(
  db: Pick<PrismaClient, 'td2Event'>,
  guildId: string,
  now = new Date(),
  limit = 50,
): Promise<Td2EventOverview[]> {
  const events = await db.td2Event.findMany({
    where: { guildId, cancelledAt: null, scheduledAt: { gt: now } },
    include: OVERVIEW,
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });
  return events.map(toOverview);
}

/** Les serveurs qui affichent leurs sorties sur la page publique, et où le bot est encore. */
const PUBLIC_GUILD = {
  leftAt: null,
  config: { is: { td2PublicListing: true } },
} as const satisfies Prisma.GuildWhereInput;

export interface PublicTd2Event extends Td2EventOverview {
  guild: { id: string; name: string; icon: string | null };
}

/** Les sorties à venir de tous les serveurs qui ont choisi de les montrer, la plus proche d'abord. */
export async function listPublicTd2Events(
  db: Pick<PrismaClient, 'td2Event'>,
  now = new Date(),
  limit = 200,
): Promise<PublicTd2Event[]> {
  const events = await db.td2Event.findMany({
    where: { cancelledAt: null, scheduledAt: { gt: now }, guild: PUBLIC_GUILD },
    include: { ...OVERVIEW, guild: { select: { id: true, name: true, icon: true } } },
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    take: limit,
  });
  return events.map((event) => ({ ...toOverview(event), guild: event.guild }));
}

/**
 * Un serveur listé sur la page publique, avec le salon TD2 où le bot crée l'invitation.
 * null : inconnu, quitté par le bot, ou qui ne se montre pas.
 */
export function findPublicTd2Guild(db: Pick<PrismaClient, 'guild'>, guildId: string) {
  return db.guild.findFirst({
    where: { id: guildId, ...PUBLIC_GUILD },
    select: { id: true, name: true, config: { select: { td2ChannelId: true } } },
  });
}
