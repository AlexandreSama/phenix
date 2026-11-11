import { afterAll, describe, expect, inject, it } from 'vitest';
import { createPrismaClient } from './client.js';
import {
  advanceGiveawayEnd,
  closeGiveaway,
  createGiveaway,
  deleteGiveaway,
  findGiveaway,
  findGiveawaysToResume,
  joinGiveaway,
  leaveGiveaway,
  listGiveaways,
  markGiveawayAnnounced,
  rerollGiveaway,
} from './giveaways.js';
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

const newGiveaway = async (guildId: string, winnersCount = 1, endsAt = new Date('2026-11-10')) =>
  createGiveaway(prisma, {
    guildId,
    channelId: '400000000000000001',
    hostId: '1',
    prize: 'Nitro',
    winnersCount,
    requiredRoleId: null,
    endsAt,
  });

const member = (userId: string) => ({ userId, displayName: `Membre ${userId}` });

describe('participations', () => {
  it('inscrit une fois, désinscrit, et compte les participants', async () => {
    const giveaway = await newGiveaway(await newGuild());

    expect(await joinGiveaway(prisma, giveaway.id, member('1'))).toBe('joined');
    expect(await joinGiveaway(prisma, giveaway.id, member('1'))).toBe('already');
    expect(await joinGiveaway(prisma, giveaway.id, member('2'))).toBe('joined');
    expect((await findGiveaway(prisma, giveaway.id))?._count.entries).toBe(2);

    expect(await leaveGiveaway(prisma, giveaway.id, '2')).toBe('left');
    expect(await leaveGiveaway(prisma, giveaway.id, '2')).toBe('not-entered');
    expect(await joinGiveaway(prisma, 999_999_999, member('1'))).toBe('missing');
  });

  it('chaque participation est soit tirée au sort, soit refusée, même pendant le tirage', async () => {
    const giveaway = await newGiveaway(await newGuild(), 50);

    const [results, closed] = await Promise.all([
      Promise.all(
        Array.from({ length: 30 }, (_, i) => joinGiveaway(prisma, giveaway.id, member(`${i}`))),
      ),
      closeGiveaway(prisma, giveaway.id),
    ]);

    const joined = results.filter((result) => result === 'joined').length;
    const refused = results.filter((result) => result === 'ended').length;
    expect(joined + refused).toBe(30);
    // Tous les inscrits acceptés ont gagné (50 places), aucun refusé n'a été compté
    expect(closed?.winnerIds).toHaveLength(joined);
  });
});

describe('tirage', () => {
  it('tire une seule fois, même appelé deux fois en même temps', async () => {
    const giveaway = await newGiveaway(await newGuild(), 1);
    for (const id of ['1', '2', '3']) await joinGiveaway(prisma, giveaway.id, member(id));

    const [first, second] = await Promise.all([
      closeGiveaway(prisma, giveaway.id),
      closeGiveaway(prisma, giveaway.id),
    ]);

    expect(first?.winnerIds).toHaveLength(1);
    expect(second?.winnerIds).toEqual(first?.winnerIds);
    expect(await joinGiveaway(prisma, giveaway.id, member('4'))).toBe('ended');
  });

  it('« Terminer » avance la date de fin, mais pas celle d’un giveaway tiré', async () => {
    const live = await newGiveaway(await newGuild());
    const drawn = await newGiveaway(await newGuild());
    await closeGiveaway(prisma, drawn.id);
    const now = new Date('2026-11-09T15:00:00Z');

    await advanceGiveawayEnd(prisma, live.id, now);
    await advanceGiveawayEnd(prisma, drawn.id, now);

    expect((await findGiveaway(prisma, live.id))?.endsAt).toEqual(now);
    expect((await findGiveaway(prisma, drawn.id))?.endsAt).toEqual(drawn.endsAt);
  });

  it('relance parmi ceux qui n’avaient pas gagné, et repasse « à annoncer »', async () => {
    const giveaway = await newGiveaway(await newGuild(), 1);
    for (const id of ['1', '2']) await joinGiveaway(prisma, giveaway.id, member(id));
    expect(await rerollGiveaway(prisma, giveaway.id)).toBe('not-ended');

    const closed = await closeGiveaway(prisma, giveaway.id);
    await markGiveawayAnnounced(prisma, giveaway.id);
    const rerolled = await rerollGiveaway(prisma, giveaway.id);

    expect(rerolled).not.toBe('not-ended');
    const winner = (rerolled as { winnerIds: string[] }).winnerIds[0];
    expect(winner).toBeDefined();
    expect(winner).not.toBe(closed?.winnerIds[0]);
    expect((rerolled as { announcedAt: Date | null }).announcedAt).toBe(null);

    // Rejouée avant l'annonce : pas de nouveau tirage
    const replayed = await rerollGiveaway(prisma, giveaway.id);
    expect((replayed as { winnerIds: string[] }).winnerIds).toEqual([winner]);
  });
});

describe('reprise et liste', () => {
  it('retrouve les giveaways en cours et ceux tirés mais pas annoncés', async () => {
    const guildId = await newGuild();
    const live = await newGiveaway(guildId);
    const drawn = await newGiveaway(guildId);
    const done = await newGiveaway(guildId);
    await closeGiveaway(prisma, drawn.id);
    await closeGiveaway(prisma, done.id);
    await markGiveawayAnnounced(prisma, done.id);

    const ids = (await findGiveawaysToResume(prisma, [guildId])).map((row) => row.id);
    expect(ids.toSorted((a, b) => a - b)).toEqual([live.id, drawn.id]);
  });

  it('liste les terminés avec le pseudo des gagnants', async () => {
    const guildId = await newGuild();
    const giveaway = await newGiveaway(guildId, 1);
    await joinGiveaway(prisma, giveaway.id, member('7'));
    await closeGiveaway(prisma, giveaway.id);
    await newGiveaway(guildId);

    const ended = await listGiveaways(prisma, guildId, 'ended', 1, 10);
    expect(ended.total).toBe(1);
    expect(ended.giveaways[0]?.winners).toEqual([{ id: '7', name: 'Membre 7' }]);
    expect((await listGiveaways(prisma, guildId, 'active', 1, 10)).total).toBe(1);
  });

  it('supprime le giveaway avec ses participations', async () => {
    const giveaway = await newGiveaway(await newGuild());
    await joinGiveaway(prisma, giveaway.id, member('1'));

    expect((await deleteGiveaway(prisma, giveaway.id))?.id).toBe(giveaway.id);
    expect(await deleteGiveaway(prisma, giveaway.id)).toBe(null);
    expect(await prisma.giveawayEntry.count({ where: { giveawayId: giveaway.id } })).toBe(0);
  });
});
