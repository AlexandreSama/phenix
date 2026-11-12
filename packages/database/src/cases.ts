import { CaseType } from './generated/prisma/enums.js';
import type { Case, Prisma, PrismaClient, RevocationSource } from './generated/prisma/client.js';

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
  return db.$transaction((tx) => insertCase(tx, input));
}

/** L'insertion elle-même, pour qui est déjà dans une transaction (voir `liftSanction`). */
async function insertCase(tx: Prisma.TransactionClient, input: NewCase): Promise<Case> {
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
  /** D'où vient la levée ; COMMAND quand on ne le dit pas (les commandes du bot) */
  via?: RevocationSource;
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
    data: { revokedAt: now, revokedById: input.revokedById, revokedVia: input.via ?? 'COMMAND' },
  });
  return count;
}

export function findCaseById(
  db: Pick<PrismaClient, 'case'>,
  guildId: string,
  id: number,
): Promise<Case | null> {
  // guildId dans le filtre : un identifiant d'un autre serveur ne rend rien
  return db.case.findFirst({ where: { id, guildId } });
}

export interface LiftInput {
  guildId: string;
  /** Nom du serveur, au cas où sa ligne n'existerait pas encore */
  guildName: string;
  targetId: string;
  type: 'WARN' | 'MUTE' | 'BAN';
  /** Une seule sanction ; sans numéro, toutes les sanctions actives de ce type */
  number?: number;
  /** Qui lève : le modérateur, ou le bot pour la levée automatique */
  actorId: string;
  reason?: string | null;
  via: RevocationSource;
}

export interface LiftResult {
  /** Combien de sanctions ont été levées ; 0 : déjà levées, ou plus actives */
  revoked: number;
  /** Le débannissement ou la fin de sourdine créés ; null pour un avertissement, ou si rien n'a été levé */
  record: Case | null;
}

/**
 * Lève des sanctions et en garde la trace, en une transaction : la levée, puis, pour un ban ou une
 * sourdine, la sanction de fin (UNBAN, UNMUTE) au nom de celui qui lève. Idempotent : si une autre
 * levée est passée avant (site, commande, levée automatique), rien n'est levé ni créé une seconde fois.
 * L'action sur Discord est faite AVANT, par l'appelant : si elle échoue, la base ne change pas.
 */
export function liftSanction(
  db: PrismaClient,
  input: LiftInput,
  now = new Date(),
): Promise<LiftResult> {
  return db.$transaction(async (tx) => {
    const revoked = await revokeCases(
      tx,
      {
        guildId: input.guildId,
        targetId: input.targetId,
        type: input.type,
        number: input.number,
        revokedById: input.actorId,
        via: input.via,
      },
      now,
    );
    if (revoked === 0 || input.type === 'WARN') return { revoked, record: null };
    const record = await insertCase(tx, {
      guildId: input.guildId,
      guildName: input.guildName,
      type: input.type === 'BAN' ? 'UNBAN' : 'UNMUTE',
      targetId: input.targetId,
      moderatorId: input.actorId,
      reason: input.reason ?? null,
    });
    return { revoked, record };
  });
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

// ---------- Onglet Modération du site ----------

export type CaseStatus = 'active' | 'revoked' | 'ended';

/**
 * Le statut d'une sanction. « active » : ni levée, ni mute échu (avertissement, ban, mute en cours) ;
 * « revoked » : levée ; « ended » : mute arrivé à échéance sans avoir été levé.
 * Une expulsion, une fin de sourdine ou un débannissement ne sont dans aucun de ces trois états.
 */
export function caseStatusWhere(status: CaseStatus, now = new Date()): Prisma.CaseWhereInput {
  switch (status) {
    case 'active':
      return {
        revokedAt: null,
        OR: [{ type: 'WARN' }, { type: 'BAN' }, { type: 'MUTE', expiresAt: { gt: now } }],
      };
    case 'revoked':
      return { revokedAt: { not: null } };
    case 'ended':
      return { revokedAt: null, type: 'MUTE', expiresAt: { lte: now } };
  }
}

/**
 * Le statut d'une sanction déjà lue, avec les mêmes règles que `caseStatusWhere` ; null si sans objet.
 * Un ban temporaire échu mais pas levé reste « active » : le membre est encore banni sur Discord.
 */
export function caseStatus(
  sanction: Pick<Case, 'type' | 'revokedAt' | 'expiresAt'>,
  now = new Date(),
): CaseStatus | null {
  if (sanction.revokedAt) return 'revoked';
  switch (sanction.type) {
    case 'WARN':
    case 'BAN':
      return 'active';
    case 'MUTE':
      // Sans échéance, comme caseStatusWhere : ni active ni terminée
      if (!sanction.expiresAt) return null;
      return sanction.expiresAt > now ? 'active' : 'ended';
    default:
      return null;
  }
}

const CASE_NUMBER = /^#?(\d{1,9})$/;
const SNOWFLAKE = /^\d{17,20}$/;

/** Neutralise les jokers du LIKE de PostgreSQL (l'échappement par défaut est la barre oblique inverse). */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Ce que veut dire le texte de la barre de recherche : un numéro de sanction (`12`, `#12`),
 * un identifiant Discord (cible ou modérateur) ou, sinon, un morceau de la raison.
 * Le texte n'est jamais interprété comme un motif : Prisma n'échappe PAS `%` et `_` dans
 * `contains` (ils seraient des jokers du LIKE), on le fait ici.
 */
export function caseSearchWhere(q: string | undefined): Prisma.CaseWhereInput | undefined {
  const text = q?.trim();
  if (!text) return undefined;
  const number = CASE_NUMBER.exec(text)?.[1];
  if (number) return { number: Number(number) };
  if (SNOWFLAKE.test(text)) return { OR: [{ targetId: text }, { moderatorId: text }] };
  return { reason: { contains: escapeLike(text), mode: 'insensitive' } };
}

export interface CaseListFilters {
  type?: CaseType;
  status?: CaseStatus;
  moderatorId?: string;
  targetId?: string;
  /** Bornes de période, incluses, sur la date de la sanction */
  from?: Date;
  to?: Date;
  /** Texte de la barre de recherche, voir `caseSearchWhere` */
  q?: string;
}

export interface CasePageInput {
  page: number;
  pageSize: number;
}

export const MAX_CASE_PAGE_SIZE = 100;

export interface CasePage {
  items: Case[];
  total: number;
  page: number;
  pageSize: number;
}

/** Les sanctions d'un serveur, filtrées et paginées, les plus récentes d'abord. */
export async function listGuildCases(
  db: Pick<PrismaClient, 'case'>,
  guildId: string,
  filters: CaseListFilters,
  { page, pageSize }: CasePageInput,
  now = new Date(),
): Promise<CasePage> {
  const size = Math.min(Math.max(Math.trunc(pageSize), 1), MAX_CASE_PAGE_SIZE);
  const current = Math.max(Math.trunc(page), 1);
  const created =
    filters.from || filters.to ? { createdAt: { gte: filters.from, lte: filters.to } } : undefined;
  // guildId en premier et hors de tout OR : aucun filtre ne peut sortir du serveur
  const search = caseSearchWhere(filters.q);
  const where: Prisma.CaseWhereInput = {
    AND: [
      { guildId },
      {
        ...(filters.type && { type: filters.type }),
        ...(filters.moderatorId && { moderatorId: filters.moderatorId }),
        ...(filters.targetId && { targetId: filters.targetId }),
        ...created,
      },
      ...(filters.status ? [caseStatusWhere(filters.status, now)] : []),
      ...(search ? [search] : []),
    ],
  };
  const [items, total] = await Promise.all([
    db.case.findMany({
      where,
      orderBy: { number: 'desc' },
      skip: (current - 1) * size,
      take: size,
    }),
    db.case.count({ where }),
  ]);
  return { items, total, page: current, pageSize: size };
}

export interface MemberCaseSummary {
  total: number;
  byType: Record<CaseType, number>;
  activeWarns: number;
  activeMute: { number: number; expiresAt: Date | null } | null;
  activeBan: { number: number } | null;
}

/** Le bilan d'un membre sur un serveur : compte par type et sanctions encore actives. */
export async function summarizeMemberCases(
  db: Pick<PrismaClient, 'case'>,
  guildId: string,
  targetId: string,
  now = new Date(),
): Promise<MemberCaseSummary> {
  const [groups, activeWarns, mute, ban] = await Promise.all([
    db.case.groupBy({ by: ['type'], where: { guildId, targetId }, _count: { _all: true } }),
    db.case.count({ where: { guildId, targetId, ...activeCaseWhere('WARN', now) } }),
    db.case.findFirst({
      where: { guildId, targetId, ...activeCaseWhere('MUTE', now) },
      orderBy: { number: 'desc' },
      select: { number: true, expiresAt: true },
    }),
    db.case.findFirst({
      where: { guildId, targetId, ...activeCaseWhere('BAN', now) },
      orderBy: { number: 'desc' },
      select: { number: true },
    }),
  ]);
  // Dérivé de l'énumération Prisma : un nouveau type de sanction ne peut pas être oublié
  const byType = Object.fromEntries(Object.values(CaseType).map((type) => [type, 0])) as Record<
    CaseType,
    number
  >;
  for (const group of groups) byType[group.type] = group._count._all;
  return {
    total: Object.values(byType).reduce((sum, n) => sum + n, 0),
    byType,
    activeWarns,
    activeMute: mute,
    activeBan: ban,
  };
}
