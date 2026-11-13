import { afterAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

async function newGuild(): Promise<string> {
  const id = newGuildId();
  await prisma.guild.create({ data: { id, name: 'Serveur de test' } });
  return id;
}

describe('GuildConfig : bienvenue et au revoir', () => {
  it('est désactivée par défaut, sans salon, message ni rôle', async () => {
    const guildId = await newGuild();

    const config = await prisma.guildConfig.create({ data: { guildId } });

    expect(config).toMatchObject({
      welcomeEnabled: false,
      welcomeChannelId: null,
      welcomeMessage: null,
      welcomeRoleId: null,
      goodbyeEnabled: false,
      goodbyeChannelId: null,
      goodbyeMessage: null,
    });
  });

  it('écrit puis relit les sept réglages', async () => {
    const guildId = await newGuild();
    await prisma.guildConfig.create({ data: { guildId } });

    await prisma.guildConfig.update({
      where: { guildId },
      data: {
        welcomeEnabled: true,
        welcomeChannelId: '111',
        welcomeMessage: 'Bienvenue {membre} sur {serveur} !',
        welcomeRoleId: '222',
        goodbyeEnabled: true,
        goodbyeChannelId: '333',
        goodbyeMessage: '{pseudo} a quitté {serveur}.',
      },
    });

    expect(await prisma.guildConfig.findUnique({ where: { guildId } })).toMatchObject({
      welcomeEnabled: true,
      welcomeChannelId: '111',
      welcomeMessage: 'Bienvenue {membre} sur {serveur} !',
      welcomeRoleId: '222',
      goodbyeEnabled: true,
      goodbyeChannelId: '333',
      goodbyeMessage: '{pseudo} a quitté {serveur}.',
    });
  });
});

describe('GuildConfig : conservation des sanctions', () => {
  it('une config neuve garde les sanctions 12 mois', async () => {
    const guildId = await newGuild();

    const config = await prisma.guildConfig.create({ data: { guildId } });

    expect(config.caseRetentionMonths).toBe(12);
  });

  it('null (jamais) est accepté et relu', async () => {
    const guildId = await newGuild();
    await prisma.guildConfig.create({ data: { guildId, caseRetentionMonths: 6 } });

    await prisma.guildConfig.update({ where: { guildId }, data: { caseRetentionMonths: null } });

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    expect(config?.caseRetentionMonths).toBeNull();
  });
});
