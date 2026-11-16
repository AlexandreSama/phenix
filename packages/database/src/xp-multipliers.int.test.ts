import { afterAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import { compareXpMultipliers, listXpMultipliers, replaceXpMultipliers } from './xp-multipliers.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

/** Un serveur neuf par test : les tests partagent la même base, et peuvent être relancés. */
async function newGuild(): Promise<string> {
  const id = newGuildId();
  await prisma.guild.create({ data: { id, name: 'Serveur de test' } });
  return id;
}

const role = { kind: 'ROLE', targetId: '1001', percent: 150 } as const;
const channel = { kind: 'CHANNEL', targetId: '1002', percent: 50 } as const;
const category = { kind: 'CATEGORY', targetId: '1003', percent: 200 } as const;

describe('bonus d’XP', () => {
  it('liste vide par défaut', async () => {
    const guildId = await newGuild();

    expect(await listXpMultipliers(prisma, guildId)).toEqual([]);
  });

  it('enregistre puis relit les bonus, sans champ superflu', async () => {
    const guildId = await newGuild();

    await replaceXpMultipliers(prisma, guildId, [role, channel, category]);

    const list = await listXpMultipliers(prisma, guildId);
    expect(list).toHaveLength(3);
    expect(list).toEqual(expect.arrayContaining([role, channel, category]));
  });

  it('relit toujours dans le même ordre (par identifiant de cible), quel que soit l’ordre d’envoi', async () => {
    const guildId = await newGuild();

    await replaceXpMultipliers(prisma, guildId, [category, role, channel]);

    expect(await listXpMultipliers(prisma, guildId)).toEqual([role, channel, category]);
  });

  it('relit des identifiants de longueurs différentes dans l’ordre de compareXpMultipliers', async () => {
    const guildId = await newGuild();
    const short = { ...role, targetId: '99999999999999999' };
    const long = { ...channel, targetId: '100000000000000000' };
    const middle = { ...category, targetId: '400000000000000000' };

    await replaceXpMultipliers(prisma, guildId, [short, middle, long]);

    const list = await listXpMultipliers(prisma, guildId);
    expect(list).toEqual([long, middle, short]);
    expect(list).toEqual([...list].toSorted(compareXpMultipliers));
  });

  it('remplace tout : l’ancienne liste disparaît', async () => {
    const guildId = await newGuild();
    await replaceXpMultipliers(prisma, guildId, [role, channel]);

    await replaceXpMultipliers(prisma, guildId, [category]);

    expect(await listXpMultipliers(prisma, guildId)).toEqual([category]);
  });

  it('vide la liste quand on remplace par une liste vide', async () => {
    const guildId = await newGuild();
    await replaceXpMultipliers(prisma, guildId, [role]);

    await replaceXpMultipliers(prisma, guildId, []);

    expect(await listXpMultipliers(prisma, guildId)).toEqual([]);
  });

  it('ne touche pas aux bonus d’un autre serveur', async () => {
    const guildId = await newGuild();
    const other = await newGuild();
    await replaceXpMultipliers(prisma, other, [role]);

    await replaceXpMultipliers(prisma, guildId, [channel]);

    expect(await listXpMultipliers(prisma, other)).toEqual([role]);
  });

  it('remplace de façon atomique : un échec au milieu garde l’ancienne liste', async () => {
    const guildId = await newGuild();
    await replaceXpMultipliers(prisma, guildId, [role, channel]);

    // Deux fois la même cible : la création échoue après la suppression
    await expect(replaceXpMultipliers(prisma, guildId, [category, category])).rejects.toThrow(
      /Unique constraint|XpMultiplier_pkey/,
    );

    const list = await listXpMultipliers(prisma, guildId);
    expect(list).toHaveLength(2);
    expect(list).toEqual(expect.arrayContaining([role, channel]));
  });

  it('refuse une même cible deux fois dans un serveur (clé guildId + targetId)', async () => {
    const guildId = await newGuild();
    await prisma.xpMultiplier.create({ data: { guildId, ...role } });

    await expect(
      prisma.xpMultiplier.create({ data: { guildId, ...role, percent: 120 } }),
    ).rejects.toThrow(/Unique constraint|XpMultiplier_pkey/);
  });

  it('accepte la même cible dans deux serveurs', async () => {
    const guildId = await newGuild();
    const other = await newGuild();

    await replaceXpMultipliers(prisma, guildId, [role]);
    await replaceXpMultipliers(prisma, other, [role]);

    expect(await listXpMultipliers(prisma, guildId)).toEqual([role]);
    expect(await listXpMultipliers(prisma, other)).toEqual([role]);
  });

  it('disparaît avec le serveur (suppression en cascade)', async () => {
    const guildId = await newGuild();
    await replaceXpMultipliers(prisma, guildId, [role, channel]);

    await prisma.guild.delete({ where: { id: guildId } });

    expect(await prisma.xpMultiplier.count({ where: { guildId } })).toBe(0);
  });
});

describe('GuildConfig : plafond du bonus d’XP', () => {
  it('vaut 300 % par défaut', async () => {
    const guildId = await newGuild();

    const config = await prisma.guildConfig.create({ data: { guildId } });

    expect(config.xpMultiplierMaxPercent).toBe(300);
  });
});
