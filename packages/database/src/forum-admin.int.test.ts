import { afterAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import {
  createForumCategory,
  deleteForumCategory,
  listForumStaff,
  searchForumMembers,
  setForumRole,
  updateForumCategory,
} from './forum-admin.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

const run = newGuildId().slice(-8);
const category = (slug: string) => ({
  slug: `${slug}-${run}`,
  name: slug,
  description: null,
  position: 0,
});

describe('catégories', () => {
  it('ajoute, refuse un slug déjà pris, renomme', async () => {
    expect(await createForumCategory(prisma, category('annonces'))).toEqual({ status: 'ok' });
    expect(await createForumCategory(prisma, category('annonces'))).toEqual({
      status: 'duplicate',
    });
    await createForumCategory(prisma, category('entraide'));
    const { id } = await prisma.forumCategory.findUniqueOrThrow({
      where: { slug: `entraide-${run}` },
    });

    expect(await updateForumCategory(prisma, id, category('annonces'))).toEqual({
      status: 'duplicate',
    });
    expect(
      await updateForumCategory(prisma, id, { ...category('entraide'), name: 'Entraide TD2' }),
    ).toEqual({ status: 'ok' });
    expect(await updateForumCategory(prisma, 999_999, category('perdue'))).toEqual({
      status: 'missing',
    });
  });

  it('ne supprime qu’une catégorie vide', async () => {
    await createForumCategory(prisma, category('pleine'));
    await createForumCategory(prisma, category('videe'));
    const full = await prisma.forumCategory.findUniqueOrThrow({ where: { slug: `pleine-${run}` } });
    const empty = await prisma.forumCategory.findUniqueOrThrow({ where: { slug: `videe-${run}` } });
    const authorId = newGuildId();
    await prisma.user.create({ data: { id: authorId, username: 'Agent' } });
    await prisma.forumThread.create({
      data: {
        categoryId: full.id,
        authorId,
        title: 'Un sujet',
        posts: { create: { authorId, content: 'x' } },
      },
    });

    expect(await deleteForumCategory(prisma, full.id)).toEqual({ status: 'in-use', threads: 1 });
    expect(await deleteForumCategory(prisma, empty.id)).toEqual({ status: 'ok' });
    expect(await deleteForumCategory(prisma, empty.id)).toEqual({ status: 'missing' });
  });
});

describe('rôles', () => {
  it('cherche un membre par son nom, lui donne un rôle, et la liste de l’équipe suit', async () => {
    const id = newGuildId();
    await prisma.user.create({ data: { id, username: `Faye${run}` } });

    expect((await searchForumMembers(prisma, `faye${run}`)).map((user) => user.id)).toEqual([id]);
    expect(await setForumRole(prisma, id, 'MODERATOR')).toBe(true);
    expect(await setForumRole(prisma, newGuildId(), 'ADMIN')).toBe(false);
    expect(await listForumStaff(prisma)).toContainEqual({
      id,
      username: `Faye${run}`,
      avatar: null,
      role: 'MODERATOR',
    });

    await setForumRole(prisma, id, 'MEMBER');
    expect((await listForumStaff(prisma)).some((user) => user.id === id)).toBe(false);
  });
});
