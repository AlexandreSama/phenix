import type { PrismaClient, UserRole } from './generated/prisma/client.js';

export interface ForumCategoryWrite {
  slug: string;
  name: string;
  description: string | null;
  position: number;
}

export type ForumCategoryResult =
  | { status: 'ok' }
  | { status: 'missing' }
  /** Le slug est déjà celui d'une autre catégorie */
  | { status: 'duplicate' };

/** Ajoute une catégorie. Un slug déjà pris ne lève pas d'erreur : il est signalé. */
export async function createForumCategory(
  db: Pick<PrismaClient, 'forumCategory'>,
  data: ForumCategoryWrite,
): Promise<ForumCategoryResult> {
  const { count } = await db.forumCategory.createMany({ data: [data], skipDuplicates: true });
  return { status: count === 1 ? 'ok' : 'duplicate' };
}

export async function updateForumCategory(
  db: Pick<PrismaClient, 'forumCategory'>,
  id: number,
  data: ForumCategoryWrite,
): Promise<ForumCategoryResult> {
  const clash = await db.forumCategory.findFirst({
    where: { slug: data.slug, id: { not: id } },
    select: { id: true },
  });
  if (clash) return { status: 'duplicate' };
  const { count } = await db.forumCategory.updateMany({ where: { id }, data });
  return { status: count === 1 ? 'ok' : 'missing' };
}

/** Supprime une catégorie vide. Une catégorie qui a des sujets se vide d'abord, sujet par sujet. */
export async function deleteForumCategory(
  db: Pick<PrismaClient, 'forumCategory'>,
  id: number,
): Promise<{ status: 'ok' } | { status: 'missing' } | { status: 'in-use'; threads: number }> {
  const category = await db.forumCategory.findUnique({
    where: { id },
    select: { _count: { select: { threads: true } } },
  });
  if (!category) return { status: 'missing' };
  if (category._count.threads > 0) return { status: 'in-use', threads: category._count.threads };
  await db.forumCategory.delete({ where: { id } });
  return { status: 'ok' };
}

const MEMBER = { id: true, username: true, avatar: true, role: true } as const;

/** Les modérateurs et administrateurs du forum, administrateurs d'abord. */
export function listForumStaff(db: Pick<PrismaClient, 'user'>) {
  return db.user.findMany({
    where: { role: { not: 'MEMBER' } },
    orderBy: [{ role: 'desc' }, { username: 'asc' }],
    select: MEMBER,
  });
}

/** Les membres du site dont le nom contient `query`, pour leur donner un rôle. */
export function searchForumMembers(db: Pick<PrismaClient, 'user'>, query: string) {
  return db.user.findMany({
    where: { username: { contains: query, mode: 'insensitive' } },
    orderBy: { username: 'asc' },
    take: 10,
    select: MEMBER,
  });
}

/** Change le rôle d'un membre sur le forum. false s'il ne s'est jamais connecté au site. */
export async function setForumRole(
  db: Pick<PrismaClient, 'user'>,
  userId: string,
  role: UserRole,
): Promise<boolean> {
  const { count } = await db.user.updateMany({ where: { id: userId }, data: { role } });
  return count === 1;
}
