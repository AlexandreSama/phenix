import { afterAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import { findTd2Profile, linkTd2Profile, unlinkTd2Profile } from './td2-profiles.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

// Des ID uniques à ce lancement, fabriqués comme ceux des serveurs
const newUserId = newGuildId;

describe('comptes TD2 liés', () => {
  it('lie un compte, puis le retrouve', async () => {
    const userId = newUserId();
    const linkedAt = new Date('2026-11-10T12:00:00Z');

    await linkTd2Profile(prisma, { userId, platform: 'PSN', playerName: '  Agent47 ' }, linkedAt);

    expect(await findTd2Profile(prisma, userId)).toEqual({
      userId,
      platform: 'PSN',
      playerName: 'Agent47',
      linkedAt,
    });
    expect(await findTd2Profile(prisma, newUserId())).toBe(null);
  });

  it('un second lien remplace le premier : un seul compte par membre', async () => {
    const userId = newUserId();
    await linkTd2Profile(prisma, { userId, platform: 'PSN', playerName: 'Agent47' });

    await linkTd2Profile(prisma, { userId, platform: 'UBI', playerName: 'Agent47-PC' });

    expect(await findTd2Profile(prisma, userId)).toMatchObject({
      platform: 'UBI',
      playerName: 'Agent47-PC',
    });
    expect(await prisma.td2Profile.count({ where: { userId } })).toBe(1);
  });

  it('délie un compte, et dit s’il n’y en avait pas', async () => {
    const userId = newUserId();
    await linkTd2Profile(prisma, { userId, platform: 'XBL', playerName: 'Rogue' });

    expect(await unlinkTd2Profile(prisma, userId)).toBe(true);
    expect(await unlinkTd2Profile(prisma, userId)).toBe(false);
    expect(await findTd2Profile(prisma, userId)).toBe(null);
  });
});
