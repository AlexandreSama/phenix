import type { PrismaClient } from './generated/prisma/client.js';

type Db = Pick<
  PrismaClient,
  'forumCategory' | 'forumThread' | 'forumPost' | 'forumAttachment' | '$transaction'
>;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Ce que le forum montre d'un auteur. */
const AUTHOR = { select: { id: true, username: true, avatar: true, role: true } } as const;

/** Les messages d'un sujet, du premier au dernier. */
const POST_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

/** Les catégories dans leur ordre, avec leur nombre de sujets et leur dernière activité. */
export async function listForumCategories(db: Pick<PrismaClient, 'forumCategory' | 'forumThread'>) {
  const [categories, activity] = await Promise.all([
    db.forumCategory.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { threads: true } } },
    }),
    db.forumThread.groupBy({ by: ['categoryId'], _max: { updatedAt: true } }),
  ]);
  const last = new Map(activity.map((row) => [row.categoryId, row._max.updatedAt]));
  return categories.map(({ _count, ...category }) => ({
    ...category,
    threadCount: _count.threads,
    lastActivityAt: last.get(category.id) ?? null,
  }));
}

export function findForumCategory(db: Pick<PrismaClient, 'forumCategory'>, slug: string) {
  return db.forumCategory.findUnique({ where: { slug } });
}

interface PageRequest {
  page: number;
  take: number;
}

/** Une page des sujets d'une catégorie : épinglés d'abord, puis par dernière activité. */
export async function listForumThreads(
  db: Pick<PrismaClient, 'forumThread'>,
  { categoryId, page, take }: PageRequest & { categoryId: number },
) {
  const where = { categoryId };
  const [threads, total] = await Promise.all([
    db.forumThread.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * take,
      take,
      include: { author: AUTHOR, _count: { select: { posts: true } } },
    }),
    db.forumThread.count({ where }),
  ]);
  return { threads, total };
}

export function findForumThread(db: Pick<PrismaClient, 'forumThread'>, id: number) {
  return db.forumThread.findUnique({
    where: { id },
    include: { category: { select: { id: true, slug: true, name: true } } },
  });
}

/** Une page des messages d'un sujet, dans l'ordre. */
export async function listForumPosts(
  db: Pick<PrismaClient, 'forumPost'>,
  { threadId, page, take }: PageRequest & { threadId: number },
) {
  const where = { threadId };
  const [posts, total] = await Promise.all([
    db.forumPost.findMany({
      where,
      orderBy: POST_ORDER,
      skip: (page - 1) * take,
      take,
      include: { author: AUTHOR },
    }),
    db.forumPost.count({ where }),
  ]);
  return { posts, total };
}

/** Le premier message d'un sujet : il ne se supprime qu'avec le sujet entier. */
export async function firstForumPostId(
  db: Pick<PrismaClient, 'forumPost'>,
  threadId: number,
): Promise<number | null> {
  const first = await db.forumPost.findFirst({
    where: { threadId },
    orderBy: POST_ORDER,
    select: { id: true },
  });
  return first?.id ?? null;
}

/**
 * Rattache à un message les images qu'il cite. Seules celles envoyées par `uploaderId` et pas
 * encore publiées : on ne s'approprie pas l'image d'un autre message.
 */
async function attachImages(tx: Tx, postId: number, uploaderId: string, imageIds: string[]) {
  if (imageIds.length === 0) return;
  await tx.forumAttachment.updateMany({
    where: { id: { in: imageIds }, uploaderId, postId: null },
    data: { postId },
  });
}

export interface NewForumThread {
  categoryId: number;
  authorId: string;
  title: string;
  content: string;
  imageIds: string[];
}

/** Ouvre un sujet avec son premier message. null si la catégorie n'existe pas. */
export function createForumThread(
  db: Db,
  { categoryId, authorId, title, content, imageIds }: NewForumThread,
): Promise<{ threadId: number; postId: number } | null> {
  return db.$transaction(async (tx) => {
    const category = await tx.forumCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) return null;

    const thread = await tx.forumThread.create({
      data: { categoryId, authorId, title, posts: { create: { authorId, content } } },
      select: { id: true, posts: { select: { id: true } } },
    });
    const postId = thread.posts[0]?.id;
    if (postId === undefined) throw new Error('Sujet créé sans message');
    await attachImages(tx, postId, authorId, imageIds);
    return { threadId: thread.id, postId };
  });
}

export interface NewForumReply {
  threadId: number;
  authorId: string;
  content: string;
  imageIds: string[];
  /** Les modérateurs répondent même dans un sujet verrouillé */
  bypassLock: boolean;
}

export type ForumReplyResult =
  | { status: 'missing' }
  | { status: 'locked' }
  /** `position` : le rang du message dans le sujet, pour calculer sa page */
  | { status: 'ok'; postId: number; position: number };

/** Répond dans un sujet, qui remonte en tête de sa catégorie. */
export function createForumReply(
  db: Db,
  { threadId, authorId, content, imageIds, bypassLock }: NewForumReply,
): Promise<ForumReplyResult> {
  return db.$transaction(async (tx): Promise<ForumReplyResult> => {
    const thread = await tx.forumThread.findUnique({
      where: { id: threadId },
      select: { locked: true },
    });
    if (!thread) return { status: 'missing' };
    if (thread.locked && !bypassLock) return { status: 'locked' };

    const post = await tx.forumPost.create({
      data: { threadId, authorId, content },
      select: { id: true },
    });
    await tx.forumThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
    await attachImages(tx, post.id, authorId, imageIds);
    const position = await tx.forumPost.count({ where: { threadId, id: { lte: post.id } } });
    return { status: 'ok', postId: post.id, position };
  });
}

/** Un message, avec ce qu'il faut savoir de son sujet pour décider qui peut y toucher. */
export function findForumPost(db: Pick<PrismaClient, 'forumPost'>, id: number) {
  return db.forumPost.findUnique({
    where: { id },
    include: { thread: { select: { id: true, locked: true } } },
  });
}

export interface ForumPostEdit {
  postId: number;
  editorId: string;
  content: string;
  imageIds: string[];
  now?: Date;
}

/**
 * Modifie un message. Les images retirées du texte redeviennent orphelines : le ménage
 * régulier les supprimera. Les nouvelles, envoyées par celui qui modifie, sont rattachées.
 */
export async function updateForumPost(
  db: Db,
  { postId, editorId, content, imageIds, now = new Date() }: ForumPostEdit,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.forumPost.update({ where: { id: postId }, data: { content, editedAt: now } });
    await tx.forumAttachment.updateMany({
      where: { postId, id: { notIn: imageIds } },
      data: { postId: null },
    });
    await attachImages(tx, postId, editorId, imageIds);
  });
}

/** Supprime un message. Rend les clés de ses images, à retirer du bucket ; null s'il n'existait pas. */
export function deleteForumPost(db: Db, postId: number): Promise<string[] | null> {
  return db.$transaction(async (tx) => {
    const images = await tx.forumAttachment.findMany({ where: { postId }, select: { key: true } });
    const { count } = await tx.forumPost.deleteMany({ where: { id: postId } });
    return count === 0 ? null : images.map((image) => image.key);
  });
}

/** Supprime un sujet et tous ses messages. Rend les clés de leurs images ; null s'il n'existait pas. */
export function deleteForumThread(db: Db, threadId: number): Promise<string[] | null> {
  return db.$transaction(async (tx) => {
    const images = await tx.forumAttachment.findMany({
      where: { post: { threadId } },
      select: { key: true },
    });
    const { count } = await tx.forumThread.deleteMany({ where: { id: threadId } });
    return count === 0 ? null : images.map((image) => image.key);
  });
}

/** Épingle ou verrouille un sujet. false s'il n'existe pas. */
export async function moderateForumThread(
  db: Pick<PrismaClient, 'forumThread'>,
  id: number,
  patch: { pinned?: boolean; locked?: boolean },
): Promise<boolean> {
  const thread = await db.forumThread.findUnique({ where: { id }, select: { updatedAt: true } });
  if (!thread) return false;
  // updatedAt sert de « dernière activité » : épingler ne doit pas faire remonter le sujet
  await db.forumThread.update({ where: { id }, data: { ...patch, updatedAt: thread.updatedAt } });
  return true;
}

export interface NewForumImage {
  id: string;
  uploaderId: string;
  key: string;
  sizeBytes: number;
  width: number;
  height: number;
}

/** Enregistre une image envoyée : orpheline tant qu'aucun message ne la cite. */
export function createForumImage(db: Pick<PrismaClient, 'forumAttachment'>, data: NewForumImage) {
  return db.forumAttachment.create({ data });
}

export function findForumImage(db: Pick<PrismaClient, 'forumAttachment'>, id: string) {
  return db.forumAttachment.findUnique({ where: { id }, select: { key: true } });
}

/** Les images restées sans message depuis avant `before` : jamais publiées, ou retirées. */
export function listOrphanForumImages(
  db: Pick<PrismaClient, 'forumAttachment'>,
  before: Date,
  take = 100,
) {
  return db.forumAttachment.findMany({
    where: { postId: null, createdAt: { lt: before } },
    select: { id: true, key: true },
    orderBy: { createdAt: 'asc' },
    take,
  });
}

/**
 * Supprime une image orpheline. false si un message vient de la citer entre-temps :
 * le ménage ne doit alors pas toucher au fichier.
 */
export async function deleteOrphanForumImage(
  db: Pick<PrismaClient, 'forumAttachment'>,
  id: string,
): Promise<boolean> {
  const { count } = await db.forumAttachment.deleteMany({ where: { id, postId: null } });
  return count === 1;
}
