import {
  TICKET_RATING_WINDOW_DAYS,
  ticketRatingSchema,
  type RawTicketStats,
  type TicketPanelInput,
  type TicketTypeInput,
} from '@phenix/shared';
import type {
  PrismaClient,
  Ticket,
  TicketCloseSource,
  TicketPanel,
  TicketType,
  TicketTypeQuestion,
} from './generated/prisma/client.js';

type TicketDb = Pick<PrismaClient, 'ticket'>;
type PanelDb = Pick<PrismaClient, 'ticketPanel'>;
type TypeDb = Pick<PrismaClient, 'ticketType'>;

/** Un ticket avec le nom de son type (null : ticket ancien, ou type supprimé depuis). */
export type TicketWithType = Ticket & { type: { name: string } | null };

/**
 * Réserve le numéro du prochain ticket du serveur. L'incrément est atomique dans Postgres :
 * deux tickets ouverts au même instant n'ont jamais le même numéro.
 */
export async function reserveTicketNumber(
  db: Pick<PrismaClient, 'guild'>,
  guildId: string,
): Promise<number> {
  const guild = await db.guild.update({
    where: { id: guildId },
    data: { ticketCounter: { increment: 1 } },
    select: { ticketCounter: true },
  });
  return guild.ticketCounter;
}

export function createTicket(
  db: TicketDb,
  data: {
    guildId: string;
    number: number;
    channelId: string;
    ownerId: string;
    ownerName: string;
    typeId?: number | null;
  },
): Promise<Ticket> {
  return db.ticket.create({ data });
}

export function findTicket(db: TicketDb, id: number): Promise<Ticket | null> {
  return db.ticket.findUnique({ where: { id } });
}

export function findTicketByChannel(db: TicketDb, channelId: string): Promise<Ticket | null> {
  return db.ticket.findUnique({ where: { channelId } });
}

/** Le ticket encore ouvert d'un membre sur ce serveur : un seul à la fois. */
export function findOpenTicket(
  db: TicketDb,
  guildId: string,
  ownerId: string,
): Promise<Ticket | null> {
  return db.ticket.findFirst({ where: { guildId, ownerId, status: 'OPEN' } });
}

/** Les tickets ouverts de ces serveurs, pour retrouver ceux dont le salon a disparu. */
export function findOpenTicketChannels(
  db: TicketDb,
  guildIds: string[],
): Promise<{ id: number; channelId: string }[]> {
  return db.ticket.findMany({
    where: { guildId: { in: guildIds }, status: 'OPEN' },
    select: { id: true, channelId: true },
  });
}

export interface TicketClosing {
  closedById: string | null;
  closedByName: string | null;
  transcriptKey: string | null;
  messageCount: number | null;
  /** Comment le ticket est fermé ; absent : non renseigné */
  closedVia?: TicketCloseSource;
  /**
   * Fermeture automatique : la dernière activité que l'appelant a lue. Si quelqu'un a écrit
   * depuis, rien n'est fermé (renvoie false) : un membre qui répond sauve son ticket.
   */
  expectedLastActivityAt?: Date;
  now?: Date;
}

/**
 * Ferme un ticket ouvert. Renvoie false s'il était déjà fermé, ou (avec `expectedLastActivityAt`)
 * s'il y a eu de l'activité depuis : deux clics simultanés sur « Confirmer » ne ferment qu'une fois.
 */
export async function closeTicket(
  db: TicketDb,
  id: number,
  closing: TicketClosing,
): Promise<boolean> {
  const { now = new Date(), expectedLastActivityAt, ...fields } = closing;
  const { count } = await db.ticket.updateMany({
    where: {
      id,
      status: 'OPEN',
      ...(expectedLastActivityAt ? { lastActivityAt: expectedLastActivityAt } : {}),
    },
    data: { ...fields, status: 'CLOSED', closedAt: now },
  });
  return count > 0;
}

/**
 * Note une activité (un message d'un membre) dans le salon d'un ticket OUVERT : le délai
 * d'inactivité repart de zéro et le rappel éventuel est effacé. Renvoie false si ce salon n'est
 * pas celui d'un ticket ouvert.
 * Avec une date fournie (second signal, lu dans Discord), l'écriture est monotone : elle n'a lieu
 * que si `lastActivityAt` est plus ancien, pour ne jamais faire reculer une activité plus récente ;
 * renvoie aussi false dans ce cas, sans toucher au rappel.
 */
export async function touchTicketActivity(
  db: TicketDb,
  channelId: string,
  at?: Date,
): Promise<boolean> {
  const { count } = await db.ticket.updateMany({
    where: { channelId, status: 'OPEN', ...(at && { lastActivityAt: { lt: at } }) },
    data: { lastActivityAt: at ?? new Date(), inactivityRemindedAt: null },
  });
  return count > 0;
}

/**
 * Note que le rappel d'inactivité est envoyé, à condition que l'activité n'ait pas bougé depuis
 * la lecture (`expectedLastActivityAt`) et qu'aucun rappel ne soit déjà noté : un seul rappel par
 * période d'inactivité, même si deux traitements se croisent. Renvoie false sinon.
 */
export async function markTicketInactivityReminded(
  db: TicketDb,
  id: number,
  expectedLastActivityAt: Date,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await db.ticket.updateMany({
    where: {
      id,
      status: 'OPEN',
      lastActivityAt: expectedLastActivityAt,
      inactivityRemindedAt: null,
    },
    data: { inactivityRemindedAt: now },
  });
  return count > 0;
}

/** Un ticket ouvert dont le type a un délai d'inactivité : de quoi décider rappel, fermeture ou rien. */
export interface InactivityCandidate {
  id: number;
  guildId: string;
  channelId: string;
  ownerId: string;
  lastActivityAt: Date;
  inactivityRemindedAt: Date | null;
  type: { inactivityHours: number | null };
}

/** Après un échec (Discord, Garage…), un ticket n'est pas retenté avant ce délai. */
export const INACTIVITY_FAILURE_BACKOFF_MS = 60 * 60 * 1000;

/**
 * Note l'échec d'une étape de la fermeture automatique sur un ticket ouvert : il sort des
 * candidats pendant `INACTIVITY_FAILURE_BACKOFF_MS`, pour ne pas retenter sans fin un ticket qui
 * échoue au détriment des autres. Renvoie false si le ticket n'est plus ouvert.
 */
export async function markTicketInactivityFailed(
  db: TicketDb,
  id: number,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await db.ticket.updateMany({
    where: { id, status: 'OPEN' },
    data: { inactivityFailedAt: now },
  });
  return count > 0;
}

export interface InactivityCandidatesQuery {
  /** L'heure de référence du passage : seuls les tickets dus à cette heure sont lus */
  now: Date;
  /** Au plus ce nombre de tickets par passage */
  limit: number;
  /** Au plus ce nombre par serveur : un serveur ne monopolise pas le passage */
  perGuildLimit: number;
}

interface InactivityCandidateRow {
  id: number;
  guildId: string;
  channelId: string;
  ownerId: string;
  lastActivityAt: Date;
  inactivityRemindedAt: Date | null;
  inactivityHours: number;
}

/**
 * Les tickets ouverts DUS à `now` (rappel ou fermeture, mêmes règles que `inactivityDecision`
 * du bot, qui décide en dernier) : délai D du type, sans rappel et au moins D/2 sans activité, ou
 * rappel posté depuis au moins D/2 et D sans activité. Les plus anciennement actifs d'abord, au
 * plus `perGuildLimit` par serveur et `limit` en tout. Jamais un ticket sans type, un type sans
 * délai, un serveur que le bot a quitté, ni un ticket en échec depuis moins
 * d'`INACTIVITY_FAILURE_BACKOFF_MS`. Requête paramétrée (gabarit balisé de Prisma).
 */
export async function findInactivityCandidates(
  db: Pick<PrismaClient, '$queryRaw'>,
  { now, limit, perGuildLimit }: InactivityCandidatesQuery,
): Promise<InactivityCandidate[]> {
  // Les colonnes sont des TIMESTAMP sans fuseau, en UTC : la référence est convertie de même
  const reference = now.toISOString();
  const backoff = `${INACTIVITY_FAILURE_BACKOFF_MS} milliseconds`;
  const rows = await db.$queryRaw<InactivityCandidateRow[]>`
    WITH params AS (SELECT (${reference}::timestamptz AT TIME ZONE 'UTC') AS ref)
    SELECT "id", "guildId", "channelId", "ownerId", "lastActivityAt", "inactivityRemindedAt",
           "inactivityHours"
    FROM (
      SELECT t."id", t."guildId", t."channelId", t."ownerId", t."lastActivityAt",
             t."inactivityRemindedAt", ty."inactivityHours",
             ROW_NUMBER() OVER (PARTITION BY t."guildId" ORDER BY t."lastActivityAt", t."id") AS "rank"
      FROM "Ticket" t
      JOIN "TicketType" ty ON ty."id" = t."typeId"
      JOIN "Guild" g ON g."id" = t."guildId"
      CROSS JOIN params p
      WHERE t."status" = 'OPEN'
        AND g."leftAt" IS NULL
        AND ty."inactivityHours" > 0
        AND (t."inactivityFailedAt" IS NULL
             OR t."inactivityFailedAt" <= p.ref - ${backoff}::interval)
        AND (
          (t."inactivityRemindedAt" IS NULL
            AND t."lastActivityAt" <= p.ref - ty."inactivityHours" * interval '30 minutes')
          OR (t."inactivityRemindedAt" >= t."lastActivityAt"
            AND t."inactivityRemindedAt" <= p.ref - ty."inactivityHours" * interval '30 minutes'
            AND t."lastActivityAt" <= p.ref - ty."inactivityHours" * interval '1 hour')
        )
    ) due
    WHERE "rank" <= ${perGuildLimit}
    ORDER BY "lastActivityAt", "id"
    LIMIT ${limit}`;
  return rows.map(({ inactivityHours, ...rest }) => ({ ...rest, type: { inactivityHours } }));
}

/**
 * Résultat d'une prise en charge. En cas d'échec, `claimedByName` est le pseudo de la personne
 * qui l'a déjà prise (« déjà pris en charge par Y ») ; null si le ticket est fermé ou inconnu.
 */
export type ClaimResult = { claimed: true } | { claimed: false; claimedByName: string | null };

/**
 * Prend un ticket ouvert en charge, s'il ne l'est pas déjà. La condition est dans l'UPDATE
 * lui-même : deux clics simultanés n'ont qu'un gagnant, l'autre reçoit le nom du gagnant.
 */
export async function claimTicket(
  db: TicketDb,
  id: number,
  claimer: { id: string; name: string },
  now: Date = new Date(),
): Promise<ClaimResult> {
  const { count } = await db.ticket.updateMany({
    where: { id, status: 'OPEN', claimedById: null },
    data: { claimedById: claimer.id, claimedByName: claimer.name, claimedAt: now },
  });
  if (count > 0) return { claimed: true };
  const current = await db.ticket.findUnique({
    where: { id },
    select: { status: true, claimedByName: true },
  });
  return {
    claimed: false,
    claimedByName: current?.status === 'OPEN' ? current.claimedByName : null,
  };
}

/** « rated » : note enregistrée ; « already_rated » : l'auteur avait déjà noté ; « refused » : le reste. */
export type RateResult = 'rated' | 'already_rated' | 'refused';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Enregistre la note (1 à 5) que l'auteur donne à son ticket fermé, une seule fois, dans les
 * `TICKET_RATING_WINDOW_DAYS` jours après la fermeture. Tout est dans l'UPDATE conditionnel :
 * deux clics simultanés ne notent qu'une fois. Une note invalide, un autre que l'auteur, un
 * ticket ouvert, inconnu ou hors fenêtre sont « refused », sans rien écrire.
 */
export async function rateTicket(
  db: TicketDb,
  id: number,
  ownerId: string,
  rating: number,
  now: Date = new Date(),
): Promise<RateResult> {
  if (!ticketRatingSchema.safeParse(rating).success) return 'refused';
  const { count } = await db.ticket.updateMany({
    where: {
      id,
      ownerId,
      status: 'CLOSED',
      rating: null,
      closedAt: { gte: new Date(now.getTime() - TICKET_RATING_WINDOW_DAYS * DAY_MS) },
    },
    data: { rating, ratedAt: now },
  });
  if (count > 0) return 'rated';
  const current = await db.ticket.findUnique({
    where: { id },
    select: { ownerId: true, rating: true },
  });
  return current?.ownerId === ownerId && current.rating !== null ? 'already_rated' : 'refused';
}

/**
 * Nombre de notes et moyenne par type et par personne ayant pris en charge, sur tout l'historique
 * du serveur. Valeurs BRUTES, jamais envoyées au site : l'API les passe à
 * `maskRatingStats` de @phenix/shared. Jamais la note d'un ticket. Une personne sans ticket pris
 * en charge n'apparaît pas dans `members` ; son pseudo est le plus récent connu.
 */
export async function ticketRatingStats(
  db: Pick<PrismaClient, 'ticket' | 'ticketType'>,
  guildId: string,
): Promise<RawTicketStats> {
  const where = { guildId, rating: { not: null } };
  const [byType, byMember] = await Promise.all([
    db.ticket.groupBy({
      by: ['typeId'],
      where,
      _count: { rating: true },
      _avg: { rating: true },
    }),
    db.ticket.groupBy({
      by: ['claimedById'],
      where: { ...where, claimedById: { not: null } },
      _count: { rating: true },
      _avg: { rating: true },
    }),
  ]);
  const typeIds = byType.flatMap((row) => (row.typeId === null ? [] : [row.typeId]));
  const [types, names] = await Promise.all([
    db.ticketType.findMany({
      where: { guildId, id: { in: typeIds } },
      select: { id: true, name: true },
    }),
    db.ticket.findMany({
      where: { ...where, claimedById: { not: null } },
      distinct: ['claimedById'],
      orderBy: [{ claimedById: 'asc' }, { claimedAt: 'desc' }],
      select: { claimedById: true, claimedByName: true },
    }),
  ]);
  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  const memberNames = new Map(names.map((row) => [row.claimedById, row.claimedByName]));

  return {
    types: byType
      .map((row) => ({
        typeId: row.typeId,
        typeName: row.typeId === null ? null : (typeNames.get(row.typeId) ?? null),
        count: row._count.rating,
        average: row._avg.rating,
      }))
      .toSorted((a, b) => b.count - a.count || (a.typeId ?? Infinity) - (b.typeId ?? Infinity)),
    members: byMember
      .flatMap((row) =>
        row.claimedById === null
          ? []
          : [
              {
                claimedById: row.claimedById,
                claimedByName: memberNames.get(row.claimedById) ?? null,
                count: row._count.rating,
                average: row._avg.rating,
              },
            ],
      )
      .toSorted((a, b) => b.count - a.count || a.claimedById.localeCompare(b.claimedById)),
  };
}

export interface TicketSlice {
  tickets: TicketWithType[];
  page: number;
  pageCount: number;
  total: number;
}

/** Les ouverts du plus ancien au plus récent (à traiter d'abord), les fermés du plus récent. */
export async function listTickets(
  db: TicketDb,
  guildId: string,
  status: 'OPEN' | 'CLOSED',
  page: number,
  pageSize: number,
): Promise<TicketSlice> {
  const where = { guildId, status };
  const total = await db.ticket.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const tickets = await db.ticket.findMany({
    where,
    include: { type: { select: { name: true } } },
    orderBy: status === 'OPEN' ? { createdAt: 'asc' } : { closedAt: 'desc' },
    skip: (current - 1) * pageSize,
    take: pageSize,
  });
  return { tickets, page: current, pageCount, total };
}

/** Serveurs dont le panel a été enregistré pendant que le bot était éteint. */
export async function findPendingTicketPanels(db: PanelDb, guildIds: string[]): Promise<string[]> {
  const rows = await db.ticketPanel.findMany({
    where: { guildId: { in: guildIds }, publishedAt: null, publishError: null },
    select: { guildId: true },
  });
  return rows.map((row) => row.guildId);
}

export function findTicketPanel(db: PanelDb, guildId: string): Promise<TicketPanel | null> {
  return db.ticketPanel.findUnique({ where: { guildId } });
}

/** Crée ou remplace le panel du serveur ; il repasse « en attente » jusqu'à ce que le bot le publie. */
export function saveTicketPanel(
  db: PanelDb,
  guildId: string,
  input: TicketPanelInput,
  options: { forgetMessage?: boolean } = {},
): Promise<TicketPanel> {
  const fields = {
    ...input,
    publishedAt: null,
    publishError: null,
    // Nouveau salon : le bot postera un message neuf au lieu de modifier l'ancien
    ...(options.forgetMessage ? { messageId: null } : {}),
  };
  return db.ticketPanel.upsert({
    where: { guildId },
    create: { ...fields, guildId },
    update: fields,
  });
}

export async function markTicketPanelPublished(
  db: PanelDb,
  guildId: string,
  messageId: string,
): Promise<void> {
  await db.ticketPanel.updateMany({
    where: { guildId },
    data: { messageId, publishedAt: new Date(), publishError: null },
  });
}

export async function markTicketPanelFailed(
  db: PanelDb,
  guildId: string,
  error: string,
): Promise<void> {
  await db.ticketPanel.updateMany({
    where: { guildId },
    data: { publishedAt: null, publishError: error },
  });
}

export type TicketTypeWithQuestions = TicketType & { questions: TicketTypeQuestion[] };

/** Les questions dans l'ordre choisi sur le site. */
const WITH_QUESTIONS = { questions: { orderBy: { position: 'asc' } } } as const;

/** Les types du serveur dans l'ordre d'affichage du panel (position, puis création). */
export function listTicketTypes(db: TypeDb, guildId: string): Promise<TicketTypeWithQuestions[]> {
  return db.ticketType.findMany({
    where: { guildId },
    include: WITH_QUESTIONS,
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
}

export function findTicketType(db: TypeDb, id: number): Promise<TicketTypeWithQuestions | null> {
  return db.ticketType.findUnique({ where: { id }, include: WITH_QUESTIONS });
}

/**
 * Crée un type (en dernière position), ou remplace tout le contenu de celui de ce serveur.
 * Les questions sont réécrites en entier, dans l'ordre reçu. Un `id` d'un autre serveur lève
 * une erreur : on ne modifie jamais le type d'un autre.
 */
export async function saveTicketType(
  db: TypeDb,
  guildId: string,
  input: TicketTypeInput,
  id?: number,
): Promise<TicketTypeWithQuestions> {
  const { questions, ...fields } = input;
  const rows = questions.map((question, position) => ({ ...question, position }));

  if (id === undefined) {
    const last = await db.ticketType.aggregate({ where: { guildId }, _max: { position: true } });
    const position = (last._max.position ?? -1) + 1;
    return db.ticketType.create({
      data: { ...fields, guildId, position, questions: { create: rows } },
      include: WITH_QUESTIONS,
    });
  }
  // Un délai changé (y compris désactivé puis réactivé) : les rappels déjà posés sur les tickets
  // ouverts du type annonçaient une autre échéance, ils sont effacés (nouveau rappel au besoin)
  const current = await db.ticketType.findUnique({
    where: { id, guildId },
    select: { inactivityHours: true },
  });
  const delayChanged = current !== null && current.inactivityHours !== fields.inactivityHours;
  // Une seule écriture imbriquée : Prisma la passe dans une transaction
  return db.ticketType.update({
    where: { id, guildId },
    data: {
      ...fields,
      questions: { deleteMany: {}, create: rows },
      ...(delayChanged && {
        tickets: {
          updateMany: {
            where: { status: 'OPEN', inactivityRemindedAt: { not: null } },
            data: { inactivityRemindedAt: null },
          },
        },
      }),
    },
    include: WITH_QUESTIONS,
  });
}

export type DeleteTicketTypeResult = 'deleted' | 'not_found' | 'has_open_tickets';

/**
 * Supprime un type de ce serveur, sauf s'il reste un ticket ouvert : le bot en a besoin pour
 * la catégorie et les rôles. La condition est dans le DELETE lui-même (une seule requête).
 * Les tickets fermés gardent leur historique, leur typeId passe à null (clé étrangère SetNull).
 */
export async function deleteTicketType(
  db: TypeDb,
  guildId: string,
  id: number,
): Promise<DeleteTicketTypeResult> {
  const { count } = await db.ticketType.deleteMany({
    where: { id, guildId, tickets: { none: { status: 'OPEN' } } },
  });
  if (count > 0) return 'deleted';
  const exists = await db.ticketType.count({ where: { id, guildId } });
  return exists > 0 ? 'has_open_tickets' : 'not_found';
}
