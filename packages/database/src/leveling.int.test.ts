import { afterAll, describe, expect, inject, it } from 'vitest';
import { createPrismaClient } from './client.js';
import { awardXp, getLeaderboard, getMemberRank } from './leveling.js';
import { newGuildId } from '../test/ids.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

async function newGuild(): Promise<string> {
  const id = newGuildId();
  await prisma.guild.create({ data: { id, name: 'Serveur de test' } });
  return id;
}

const gain = (guildId: string, userId: string, amount: number, now = new Date()) => ({
  guildId,
  userId,
  amount,
  now,
  cooldownMs: 60_000,
  displayName: `Membre ${userId}`,
  avatarUrl: null,
});

describe('awardXp', () => {
  it('crée le profil au premier message, puis respecte le délai', async () => {
    const guildId = await newGuild();
    const start = new Date('2026-11-07T12:00:00Z');

    expect(await awardXp(prisma, gain(guildId, '1', 20, start))).toEqual({
      xp: 20,
      level: 0,
      leveledUp: false,
    });
    // 30 s plus tard : trop tôt
    expect(await awardXp(prisma, gain(guildId, '1', 20, new Date(start.getTime() + 30_000)))).toBe(
      null,
    );
    // 60 s plus tard : accepté
    const later = await awardXp(prisma, gain(guildId, '1', 20, new Date(start.getTime() + 60_000)));
    expect(later?.xp).toBe(40);

    const row = await prisma.memberLevel.findUniqueOrThrow({
      where: { guildId_userId: { guildId, userId: '1' } },
    });
    expect(row).toMatchObject({ messages: 2, displayName: 'Membre 1' });
  });

  it('annonce le passage de niveau une seule fois', async () => {
    const guildId = await newGuild();
    const t0 = new Date('2026-11-07T12:00:00Z');
    await awardXp(prisma, gain(guildId, '1', 90, t0));

    const result = await awardXp(prisma, gain(guildId, '1', 15, new Date(t0.getTime() + 60_000)));
    expect(result).toEqual({ xp: 105, level: 1, leveledUp: true });
  });

  it('ne donne qu’un seul gain pour dix messages simultanés', async () => {
    const guildId = await newGuild();
    const now = new Date();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => awardXp(prisma, gain(guildId, '1', 20, now))),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    const row = await prisma.memberLevel.findUniqueOrThrow({
      where: { guildId_userId: { guildId, userId: '1' } },
    });
    expect(row.xp).toBe(20);
  });
});

async function seed(guildId: string, xpByUser: Record<string, number>) {
  await prisma.memberLevel.createMany({
    data: Object.entries(xpByUser).map(([userId, xp]) => ({ guildId, userId, xp })),
  });
}

describe('classement', () => {
  it('range par XP, départage les ex æquo par ID et ignore les membres à 0 XP', async () => {
    const guildId = await newGuild();
    await seed(guildId, { '10': 500, '11': 900, '12': 500, '13': 0 });

    const page = await getLeaderboard(prisma, guildId, 1, 10);

    expect(page.entries.map((entry) => [entry.rank, entry.userId])).toEqual([
      [1, '11'],
      [2, '10'],
      [3, '12'],
    ]);
    expect(page.total).toBe(3);
  });

  it('pagine et ramène une page trop loin à la dernière', async () => {
    const guildId = await newGuild();
    await seed(guildId, { '10': 50, '11': 40, '12': 30, '13': 20, '14': 10 });

    const second = await getLeaderboard(prisma, guildId, 2, 2);
    expect(second.entries.map((entry) => entry.rank)).toEqual([3, 4]);
    expect(second.pageCount).toBe(3);

    const tooFar = await getLeaderboard(prisma, guildId, 99, 2);
    expect(tooFar.page).toBe(3);
    expect(tooFar.entries.map((entry) => entry.userId)).toEqual(['14']);
  });

  it('donne à /rank la même place que le classement', async () => {
    const guildId = await newGuild();
    await seed(guildId, { '10': 500, '11': 900, '12': 500 });

    const rank = await getMemberRank(prisma, guildId, '12');
    expect(rank).toMatchObject({ rank: 3, total: 3, xp: 500 });
    expect(await getMemberRank(prisma, guildId, '99')).toBe(null);
  });
});
