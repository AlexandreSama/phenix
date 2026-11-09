import { afterAll, describe, expect, inject, it } from 'vitest';
import { findAnnounceChannels } from './announcements.js';
import { createPrismaClient } from './client.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

const runId = Date.now();
let counter = 0;
async function newGuild(announceChannelId: string | null, leftAt: Date | null = null) {
  const id = `${runId}${counter++}`;
  await prisma.guild.create({
    data: { id, name: 'Serveur de test', leftAt, config: { create: { announceChannelId } } },
  });
  return id;
}

describe('findAnnounceChannels', () => {
  it("ne garde que les serveurs présents qui ont choisi un salon d'annonces", async () => {
    const withChannel = await newGuild('900000000000000001');
    const withoutChannel = await newGuild(null);
    const left = await newGuild('900000000000000002', new Date());
    const notInCache = await newGuild('900000000000000003');

    const targets = await findAnnounceChannels(prisma, [withChannel, withoutChannel, left]);

    expect(targets).toEqual([{ guildId: withChannel, channelId: '900000000000000001' }]);
    expect(targets.map((target) => target.guildId)).not.toContain(notInCache);
  });
});
