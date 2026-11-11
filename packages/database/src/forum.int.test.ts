import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import {
  createForumImage,
  createForumReply,
  createForumThread,
  deleteForumPost,
  deleteForumThread,
  deleteOrphanForumImage,
  findForumThread,
  firstForumPostId,
  listForumCategories,
  listForumPosts,
  listForumThreads,
  listOrphanForumImages,
  moderateForumThread,
  updateForumPost,
} from './forum.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

// Des ID et des slugs propres à ce lancement : les autres fichiers ne les voient pas
const run = newGuildId().slice(-8);

async function newUser(username = 'Agent') {
  const id = newGuildId();
  await prisma.user.create({ data: { id, username } });
  return id;
}

async function newCategory(name = 'Général', position = 0) {
  const category = await prisma.forumCategory.create({
    data: { slug: `${name.toLowerCase()}-${run}-${randomUUID().slice(0, 6)}`, name, position },
  });
  return category.id;
}

async function newImage(uploaderId: string, createdAt = new Date()) {
  const id = randomUUID();
  await createForumImage(prisma, {
    id,
    uploaderId,
    key: `forum/${id}.webp`,
    sizeBytes: 1000,
    width: 800,
    height: 600,
  });
  if (createdAt) await prisma.forumAttachment.update({ where: { id }, data: { createdAt } });
  return id;
}

const thread = (categoryId: number, authorId: string, imageIds: string[] = []) =>
  createForumThread(prisma, {
    categoryId,
    authorId,
    title: 'Build tank pour Dark Hours',
    content: 'Quel set pour le tank ?',
    imageIds,
  });

describe('sujets et réponses', () => {
  it('ouvre un sujet avec son premier message, et rattache ses images', async () => {
    const author = await newUser();
    const categoryId = await newCategory();
    const image = await newImage(author);

    const created = await thread(categoryId, author, [image]);

    expect(created).toMatchObject({ threadId: expect.any(Number), postId: expect.any(Number) });
    expect(await firstForumPostId(prisma, created!.threadId)).toBe(created!.postId);
    expect(await prisma.forumAttachment.findUnique({ where: { id: image } })).toMatchObject({
      postId: created!.postId,
    });
    expect(await thread(999_999, author)).toBe(null);
  });

  it('n’attache pas l’image d’un autre membre', async () => {
    const author = await newUser();
    const other = await newUser('Voleur');
    const categoryId = await newCategory();
    const image = await newImage(author);

    await thread(categoryId, other, [image]);

    expect(await prisma.forumAttachment.findUnique({ where: { id: image } })).toMatchObject({
      postId: null,
    });
  });

  it('une réponse fait remonter le sujet ; un sujet verrouillé refuse, sauf aux modérateurs', async () => {
    const author = await newUser();
    const categoryId = await newCategory();
    const older = await thread(categoryId, author);
    const newer = await thread(categoryId, author);
    const reply = (threadId: number, bypassLock = false) =>
      createForumReply(prisma, {
        threadId,
        authorId: author,
        content: 'Le set Foundry !',
        imageIds: [],
        bypassLock,
      });

    expect(await reply(older!.threadId)).toMatchObject({ status: 'ok', position: 2 });
    const page = await listForumThreads(prisma, { categoryId, page: 1, take: 20 });
    expect(page.threads.map((entry) => entry.id)).toEqual([older!.threadId, newer!.threadId]);
    expect(page.threads[0]?._count.posts).toBe(2);

    await moderateForumThread(prisma, newer!.threadId, { locked: true });
    expect(await reply(newer!.threadId)).toEqual({ status: 'locked' });
    expect(await reply(newer!.threadId, true)).toMatchObject({ status: 'ok' });
    expect(await reply(999_999)).toEqual({ status: 'missing' });
  });

  it('épingler place le sujet en tête, sans changer sa dernière activité', async () => {
    const author = await newUser();
    const categoryId = await newCategory();
    const pinned = await thread(categoryId, author);
    await thread(categoryId, author);
    const before = (await findForumThread(prisma, pinned!.threadId))?.updatedAt;

    expect(await moderateForumThread(prisma, pinned!.threadId, { pinned: true })).toBe(true);
    expect(await moderateForumThread(prisma, 999_999, { pinned: true })).toBe(false);

    const page = await listForumThreads(prisma, { categoryId, page: 1, take: 20 });
    expect(page.threads[0]).toMatchObject({ id: pinned!.threadId, pinned: true });
    expect((await findForumThread(prisma, pinned!.threadId))?.updatedAt).toEqual(before);
  });

  it('pagine les messages dans l’ordre', async () => {
    const author = await newUser();
    const categoryId = await newCategory();
    const created = await thread(categoryId, author);
    for (let i = 1; i <= 4; i++) {
      await createForumReply(prisma, {
        threadId: created!.threadId,
        authorId: author,
        content: `Réponse ${i}`,
        imageIds: [],
        bypassLock: false,
      });
    }

    const second = await listForumPosts(prisma, { threadId: created!.threadId, page: 2, take: 2 });

    expect(second.total).toBe(5);
    expect(second.posts.map((post) => post.content)).toEqual(['Réponse 2', 'Réponse 3']);
    expect(second.posts[0]?.author).toMatchObject({ id: author, username: 'Agent' });
  });
});

describe('modification et suppression', () => {
  it('modifier : l’image retirée redevient orpheline, la nouvelle est rattachée', async () => {
    const author = await newUser();
    const categoryId = await newCategory();
    const kept = await newImage(author);
    const removed = await newImage(author);
    const added = await newImage(author);
    const created = await thread(categoryId, author, [kept, removed]);
    const editedAt = new Date('2026-11-10T15:00:00Z');

    await updateForumPost(prisma, {
      postId: created!.postId,
      editorId: author,
      content: 'Corrigé',
      imageIds: [kept, added],
      now: editedAt,
    });

    const images = await prisma.forumAttachment.findMany({
      where: { id: { in: [kept, removed, added] } },
    });
    const postOf = (id: string) => images.find((image) => image.id === id)?.postId;
    expect([postOf(kept), postOf(removed), postOf(added)]).toEqual([
      created!.postId,
      null,
      created!.postId,
    ]);
    expect(await prisma.forumPost.findUnique({ where: { id: created!.postId } })).toMatchObject({
      content: 'Corrigé',
      editedAt,
    });
  });

  it('supprimer un message ou un sujet rend les clés de leurs images', async () => {
    const author = await newUser();
    const categoryId = await newCategory();
    const first = await newImage(author);
    const second = await newImage(author);
    const created = await thread(categoryId, author, [first]);
    const reply = await createForumReply(prisma, {
      threadId: created!.threadId,
      authorId: author,
      content: `![capture](/api/media/${second})`,
      imageIds: [second],
      bypassLock: false,
    });
    if (reply.status !== 'ok') throw new Error('réponse refusée');

    expect(await deleteForumPost(prisma, reply.postId)).toEqual([`forum/${second}.webp`]);
    expect(await deleteForumPost(prisma, reply.postId)).toBe(null);
    expect(await deleteForumThread(prisma, created!.threadId)).toEqual([`forum/${first}.webp`]);
    expect(await prisma.forumAttachment.count({ where: { id: { in: [first, second] } } })).toBe(0);
  });
});

describe('catégories et images orphelines', () => {
  it('compte les sujets et donne la dernière activité de chaque catégorie', async () => {
    const author = await newUser();
    const empty = await newCategory('Vide', 900);
    const busy = await newCategory('Active', 901);
    await thread(busy, author);
    await thread(busy, author);

    const categories = await listForumCategories(prisma);

    expect(categories.find((category) => category.id === empty)).toMatchObject({
      threadCount: 0,
      lastActivityAt: null,
    });
    expect(categories.find((category) => category.id === busy)).toMatchObject({
      threadCount: 2,
      lastActivityAt: expect.any(Date),
    });
  });

  it('le ménage ne voit que les orphelines anciennes, et ne touche pas une image publiée', async () => {
    const author = await newUser();
    const categoryId = await newCategory();
    const old = new Date(Date.now() - 48 * 3600_000);
    const stale = await newImage(author, old);
    const fresh = await newImage(author);
    const published = await newImage(author, old);
    await thread(categoryId, author, [published]);

    const orphans = await listOrphanForumImages(prisma, new Date(Date.now() - 24 * 3600_000), 1000);
    const ids = orphans.map((orphan) => orphan.id);

    expect(ids).toContain(stale);
    expect(ids).not.toContain(fresh);
    expect(ids).not.toContain(published);
    expect(await deleteOrphanForumImage(prisma, stale)).toBe(true);
    expect(await deleteOrphanForumImage(prisma, published)).toBe(false);
  });
});
