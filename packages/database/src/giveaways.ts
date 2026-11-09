import { randomInt as cryptoRandomInt } from 'node:crypto';
import type { Giveaway, Prisma, PrismaClient } from './generated/prisma/client.js';

type Db = Pick<PrismaClient, 'giveaway' | 'giveawayEntry'>;
type TxDb = Pick<PrismaClient, '$transaction'>;

/** Un nombre entier dans [0, max[ ; crypto.randomInt par défaut, remplaçable dans les tests. */
export type RandomInt = (max: number) => number;

/**
 * Tire `count` gagnants parmi les candidats, sans doublon. Mélange de Fisher-Yates arrêté
 * dès qu'on a assez de gagnants : chaque candidat a exactement la même chance.
 */
export function drawWinners(
  candidates: readonly string[],
  count: number,
  randomInt: RandomInt = cryptoRandomInt,
): string[] {
  const pool = [...new Set(candidates)];
  const wanted = Math.min(count, pool.length);
  for (let i = 0; i < wanted; i++) {
    const j = i + randomInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j] as string, pool[i] as string];
  }
  return pool.slice(0, wanted);
}

export type GiveawayWithCount = Giveaway & { _count: { entries: number } };

const WITH_COUNT = { _count: { select: { entries: true } } } as const;

export interface NewGiveaway {
  guildId: string;
  channelId: string;
  hostId: string;
  prize: string;
  winnersCount: number;
  requiredRoleId: string | null;
  endsAt: Date;
}

export function createGiveaway(db: Db, data: NewGiveaway): Promise<Giveaway> {
  // Les listes de Postgres n'ont pas de valeur par défaut dans Prisma
  return db.giveaway.create({ data: { ...data, winnerIds: [] } });
}

export function findGiveaway(db: Db, id: number): Promise<GiveawayWithCount | null> {
  return db.giveaway.findUnique({ where: { id }, include: WITH_COUNT });
}

type LockedGiveaway = Pick<Giveaway, 'endedAt' | 'announcedAt'>;

/**
 * Verrouille la ligne du giveaway jusqu'à la fin de la transaction.
 * FOR SHARE (participations) : plusieurs à la fois, mais pas pendant un tirage.
 * FOR UPDATE (tirage) : attend les participations en cours, et bloque les suivantes.
 */
async function lockGiveaway(
  tx: Prisma.TransactionClient,
  id: number,
  mode: 'share' | 'update',
): Promise<LockedGiveaway | undefined> {
  const rows =
    mode === 'share'
      ? await tx.$queryRaw<LockedGiveaway[]>`
          SELECT "endedAt", "announcedAt" FROM "Giveaway" WHERE "id" = ${id} FOR SHARE`
      : await tx.$queryRaw<LockedGiveaway[]>`
          SELECT "endedAt", "announcedAt" FROM "Giveaway" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0];
}

export type JoinResult = 'joined' | 'already' | 'ended' | 'missing';

/** Inscrit un membre. Une participation compte dans le tirage, ou elle est refusée : jamais entre les deux. */
export function joinGiveaway(
  db: TxDb,
  id: number,
  member: { userId: string; displayName: string },
): Promise<JoinResult> {
  return db.$transaction(async (tx) => {
    const row = await lockGiveaway(tx, id, 'share');
    if (!row) return 'missing';
    if (row.endedAt) return 'ended';
    const { count } = await tx.giveawayEntry.createMany({
      data: [{ giveawayId: id, ...member }],
      skipDuplicates: true,
    });
    return count > 0 ? 'joined' : 'already';
  });
}

export type LeaveResult = 'left' | 'not-entered' | 'ended' | 'missing';

export function leaveGiveaway(db: TxDb, id: number, userId: string): Promise<LeaveResult> {
  return db.$transaction(async (tx) => {
    const row = await lockGiveaway(tx, id, 'share');
    if (!row) return 'missing';
    if (row.endedAt) return 'ended';
    const { count } = await tx.giveawayEntry.deleteMany({ where: { giveawayId: id, userId } });
    return count > 0 ? 'left' : 'not-entered';
  });
}

/**
 * Fait le tirage, une seule fois : un giveaway déjà tiré est renvoyé tel quel.
 * Le tirage et sa date sont écrits ensemble ; l'annonce viendra après, hors transaction.
 */
export function closeGiveaway(
  db: TxDb,
  id: number,
  { now = new Date(), randomInt }: { now?: Date; randomInt?: RandomInt } = {},
): Promise<Giveaway | null> {
  return db.$transaction(async (tx) => {
    const row = await lockGiveaway(tx, id, 'update');
    if (!row) return null;
    if (row.endedAt) return tx.giveaway.findUniqueOrThrow({ where: { id } });

    const giveaway = await tx.giveaway.findUniqueOrThrow({ where: { id } });
    const entries = await tx.giveawayEntry.findMany({
      where: { giveawayId: id },
      select: { userId: true },
    });
    const winnerIds = drawWinners(
      entries.map((entry) => entry.userId),
      giveaway.winnersCount,
      randomInt,
    );
    return tx.giveaway.update({ where: { id }, data: { endedAt: now, winnerIds } });
  });
}

/**
 * Nouveau tirage parmi les participants qui n'avaient pas gagné. Le giveaway repasse
 * « à annoncer ». Renvoie 'not-ended' si le premier tirage n'a pas encore eu lieu.
 * Tant que le tirage précédent n'est pas annoncé, rien n'est retiré : une relance
 * rejouée par BullMQ après un échec d'annonce annonce le tirage déjà fait.
 */
export function rerollGiveaway(
  db: TxDb,
  id: number,
  { randomInt }: { randomInt?: RandomInt } = {},
): Promise<Giveaway | 'not-ended' | null> {
  return db.$transaction(async (tx) => {
    const row = await lockGiveaway(tx, id, 'update');
    if (!row) return null;
    if (!row.endedAt) return 'not-ended';

    const giveaway = await tx.giveaway.findUniqueOrThrow({ where: { id } });
    if (!row.announcedAt) return giveaway;
    const entries = await tx.giveawayEntry.findMany({
      where: { giveawayId: id, userId: { notIn: giveaway.winnerIds } },
      select: { userId: true },
    });
    const winnerIds = drawWinners(
      entries.map((entry) => entry.userId),
      giveaway.winnersCount,
      randomInt,
    );
    return tx.giveaway.update({ where: { id }, data: { winnerIds, announcedAt: null } });
  });
}

/**
 * « Terminer » : la date de fin devient maintenant, pour que le site affiche « tirage en cours ».
 * Sans effet sur un giveaway déjà tiré.
 */
export async function advanceGiveawayEnd(db: Db, id: number, now = new Date()): Promise<void> {
  await db.giveaway.updateMany({ where: { id, endedAt: null }, data: { endsAt: now } });
}

export async function markGiveawayAnnounced(db: Db, id: number, now = new Date()): Promise<void> {
  await db.giveaway.updateMany({ where: { id }, data: { announcedAt: now } });
}

export async function markGiveawayPublished(db: Db, id: number, messageId: string): Promise<void> {
  await db.giveaway.updateMany({
    where: { id },
    data: { messageId, publishedAt: new Date(), publishError: null },
  });
}

export async function markGiveawayFailed(db: Db, id: number, error: string): Promise<void> {
  await db.giveaway.updateMany({ where: { id }, data: { publishedAt: null, publishError: error } });
}

/** Supprime le giveaway et ses participations. Renvoie la ligne supprimée, pour retrouver son message. */
export async function deleteGiveaway(db: Db, id: number): Promise<Giveaway | null> {
  const giveaway = await db.giveaway.findUnique({ where: { id } });
  if (!giveaway) return null;
  // deleteMany : pas d'erreur si quelqu'un l'a supprimé entre-temps
  await db.giveaway.deleteMany({ where: { id } });
  return giveaway;
}

/**
 * Ce qu'il reste à faire au démarrage du bot : les giveaways jamais publiés, ceux en cours
 * (leur fin doit être planifiée) et ceux tirés mais pas encore annoncés.
 */
export function findGiveawaysToResume(
  db: Db,
  guildIds: string[],
): Promise<Pick<Giveaway, 'id' | 'endsAt' | 'endedAt' | 'messageId'>[]> {
  return db.giveaway.findMany({
    where: { guildId: { in: guildIds }, OR: [{ endedAt: null }, { announcedAt: null }] },
    select: { id: true, endsAt: true, endedAt: true, messageId: true },
  });
}

export interface GiveawaySlice {
  giveaways: (GiveawayWithCount & { winners: { id: string; name: string }[] })[];
  page: number;
  pageCount: number;
  total: number;
}

/** Les giveaways en cours (fin la plus proche d'abord) ou terminés (plus récents d'abord), avec leurs gagnants. */
export async function listGiveaways(
  db: Db,
  guildId: string,
  status: 'active' | 'ended',
  page: number,
  pageSize: number,
): Promise<GiveawaySlice> {
  const where = { guildId, endedAt: status === 'active' ? null : { not: null } };
  const total = await db.giveaway.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const rows = await db.giveaway.findMany({
    where,
    include: WITH_COUNT,
    orderBy: status === 'active' ? { endsAt: 'asc' } : { endedAt: 'desc' },
    skip: (current - 1) * pageSize,
    take: pageSize,
  });

  // Les pseudos des gagnants viennent de leur participation
  const winnerEntries = await db.giveawayEntry.findMany({
    where: { OR: rows.map((row) => ({ giveawayId: row.id, userId: { in: row.winnerIds } })) },
    select: { giveawayId: true, userId: true, displayName: true },
  });
  const names = new Map(
    winnerEntries.map((entry) => [`${entry.giveawayId}:${entry.userId}`, entry.displayName]),
  );
  const giveaways = rows.map((row) => ({
    ...row,
    winners: row.winnerIds.map((id) => ({ id, name: names.get(`${row.id}:${id}`) ?? id })),
  }));
  return { giveaways, page: current, pageCount, total };
}
