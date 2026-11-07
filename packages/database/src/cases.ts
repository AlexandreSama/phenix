import type { Case, CaseType, Prisma, PrismaClient } from './generated/prisma/client.js';

export interface NewCase {
  guildId: string;
  /** Nom du serveur, au cas où sa ligne n'existerait pas encore */
  guildName: string;
  type: CaseType;
  targetId: string;
  moderatorId: string;
  reason?: string | null;
  expiresAt?: Date | null;
}

/**
 * Enregistre une sanction avec le numéro suivant du serveur (#1, #2…).
 * L'incrément du compteur verrouille la ligne du serveur jusqu'à la fin de la transaction :
 * deux sanctions simultanées ne peuvent pas recevoir le même numéro.
 */
export async function createCase(db: PrismaClient, input: NewCase): Promise<Case> {
  return db.$transaction(async (tx) => {
    const { caseCounter } = await tx.guild.upsert({
      where: { id: input.guildId },
      update: { caseCounter: { increment: 1 } },
      create: { id: input.guildId, name: input.guildName, caseCounter: 1 },
      select: { caseCounter: true },
    });
    return tx.case.create({
      data: {
        guildId: input.guildId,
        number: caseCounter,
        type: input.type,
        targetId: input.targetId,
        moderatorId: input.moderatorId,
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
  });
}

/**
 * Une sanction est active tant qu'elle n'est pas révoquée. Un mute expire tout seul côté Discord,
 * il cesse donc d'être actif à sa date de fin. Un ban temporaire, lui, reste actif jusqu'à sa levée.
 */
export function activeCaseWhere(type: CaseType, now = new Date()): Prisma.CaseWhereInput {
  return type === 'MUTE'
    ? { type, revokedAt: null, expiresAt: { gt: now } }
    : { type, revokedAt: null };
}

/** Les sanctions d'un membre sur un serveur, les plus récentes d'abord. */
export function listCases(
  db: Pick<PrismaClient, 'case'>,
  guildId: string,
  targetId: string,
  limit = 15,
): Promise<Case[]> {
  return db.case.findMany({
    where: { guildId, targetId },
    orderBy: { number: 'desc' },
    take: limit,
  });
}

export function getCase(
  db: Pick<PrismaClient, 'case'>,
  guildId: string,
  number: number,
): Promise<Case | null> {
  return db.case.findUnique({ where: { guildId_number: { guildId, number } } });
}

export interface RevokeInput {
  guildId: string;
  targetId: string;
  type: CaseType;
  revokedById: string;
  /** Une seule sanction ; sans numéro, toutes les sanctions actives de ce type */
  number?: number;
}

/** Révoque des sanctions actives et renvoie combien l'ont été. */
export async function revokeCases(
  db: Pick<PrismaClient, 'case'>,
  input: RevokeInput,
  now = new Date(),
): Promise<number> {
  const { count } = await db.case.updateMany({
    where: {
      ...activeCaseWhere(input.type, now),
      guildId: input.guildId,
      targetId: input.targetId,
      ...(input.number !== undefined && { number: input.number }),
    },
    data: { revokedAt: now, revokedById: input.revokedById },
  });
  return count;
}

/** Bans temporaires arrivés à échéance, sur les serveurs où se trouve le bot. */
export function findExpiredBans(
  db: Pick<PrismaClient, 'case'>,
  guildIds: string[],
  now = new Date(),
  limit = 50,
): Promise<Case[]> {
  return db.case.findMany({
    where: { type: 'BAN', revokedAt: null, expiresAt: { lte: now }, guildId: { in: guildIds } },
    orderBy: { expiresAt: 'asc' },
    take: limit,
  });
}
