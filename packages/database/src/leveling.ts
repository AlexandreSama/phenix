import { levelForXp } from '@phenix/shared';
import type { MemberLevel, PrismaClient } from './generated/prisma/client.js';

type Db = Pick<PrismaClient, 'memberLevel'>;

export interface XpGain {
  guildId: string;
  userId: string;
  amount: number;
  /** Délai minimal entre deux gains du même membre */
  cooldownMs: number;
  /** Pseudo et avatar du moment, recopiés pour le classement public */
  displayName: string;
  avatarUrl: string | null;
  now?: Date;
}

export interface XpResult {
  xp: number;
  level: number;
  /** Vrai pour un seul appel quand le membre change de niveau : c'est lui qui annonce */
  leveledUp: boolean;
}

/**
 * Ajoute de l'XP à un membre, sauf s'il en a déjà gagné pendant le délai.
 * Renvoie null quand rien n'a été ajouté. Chaque étape est une seule requête atomique :
 * deux messages simultanés ne donnent jamais deux gains ni deux annonces.
 */
export async function awardXp(db: Db, gain: XpGain): Promise<XpResult | null> {
  const now = gain.now ?? new Date();
  const where = { guildId: gain.guildId, userId: gain.userId };
  const profile = { displayName: gain.displayName, avatarUrl: gain.avatarUrl };
  const select = { xp: true, level: true } as const;

  // 1. Le membre existe et le délai est passé : on ajoute, en vérifiant le délai dans la requête
  const [updated] = await db.memberLevel.updateManyAndReturn({
    where: {
      ...where,
      OR: [{ lastXpAt: null }, { lastXpAt: { lte: new Date(now.getTime() - gain.cooldownMs) } }],
    },
    data: {
      ...profile,
      xp: { increment: gain.amount },
      messages: { increment: 1 },
      lastXpAt: now,
    },
    select,
  });

  // 2. Sinon : premier message du membre, ou délai pas écoulé. L'insertion tranche :
  // ON CONFLICT DO NOTHING ne crée rien si la ligne existe déjà
  const row =
    updated ??
    (
      await db.memberLevel.createManyAndReturn({
        data: [{ ...where, ...profile, xp: gain.amount, messages: 1, lastXpAt: now }],
        skipDuplicates: true,
        select,
      })
    )[0];
  if (!row) return null;

  // 3. Changement de niveau : seule la requête qui fait monter le niveau gagne l'annonce
  const level = levelForXp(row.xp);
  if (level <= row.level) return { xp: row.xp, level: row.level, leveledUp: false };

  const { count } = await db.memberLevel.updateMany({
    where: { ...where, level: { lt: level } },
    data: { level },
  });
  return { xp: row.xp, level, leveledUp: count > 0 };
}

/** Ordre du classement : XP décroissante, puis ID pour départager les ex æquo. */
const LEADERBOARD_ORDER = [{ xp: 'desc' }, { userId: 'asc' }] as const;

export interface MemberRank extends MemberLevel {
  /** Place dans le classement, à partir de 1 */
  rank: number;
  /** Membres classés, c'est-à-dire avec au moins 1 XP */
  total: number;
}

/** Le profil XP d'un membre avec sa place, ou null s'il n'a encore rien gagné. */
export async function getMemberRank(
  db: Db,
  guildId: string,
  userId: string,
): Promise<MemberRank | null> {
  const member = await db.memberLevel.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  if (!member || member.xp === 0) return null;

  // Devant lui : plus d'XP, ou autant d'XP et un ID plus petit (même ordre que le classement)
  const [ahead, total] = await Promise.all([
    db.memberLevel.count({
      where: {
        guildId,
        OR: [{ xp: { gt: member.xp } }, { xp: member.xp, userId: { lt: userId } }],
      },
    }),
    db.memberLevel.count({ where: { guildId, xp: { gt: 0 } } }),
  ]);
  return { ...member, rank: ahead + 1, total };
}

export interface LeaderboardSlice {
  entries: (MemberLevel & { rank: number })[];
  page: number;
  pageCount: number;
  total: number;
}

/**
 * Une page du classement, numérotée à partir de 1.
 * Une page trop loin renvoie la dernière : le nombre de membres classés bouge entre deux clics.
 */
export async function getLeaderboard(
  db: Db,
  guildId: string,
  page: number,
  pageSize: number,
): Promise<LeaderboardSlice> {
  const where = { guildId, xp: { gt: 0 } };
  const total = await db.memberLevel.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const offset = (current - 1) * pageSize;

  const rows = await db.memberLevel.findMany({
    where,
    orderBy: [...LEADERBOARD_ORDER],
    skip: offset,
    take: pageSize,
  });
  return {
    entries: rows.map((row, index) => ({ ...row, rank: offset + index + 1 })),
    page: current,
    pageCount,
    total,
  };
}
