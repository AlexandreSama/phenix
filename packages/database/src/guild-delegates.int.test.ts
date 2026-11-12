import { afterAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import {
  deleteGuildDelegate,
  findDelegatedModules,
  listDelegationsOf,
  listGuildDelegates,
  saveGuildDelegate,
} from './guild-delegates.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

async function newGuild() {
  const id = newGuildId();
  await prisma.guild.create({ data: { id, name: 'Serveur de test' } });
  return id;
}

const grant = (
  guildId: string,
  userId: string,
  username: string,
  modules: ('TD2' | 'TICKETS' | 'ROLES' | 'WELCOME')[],
) =>
  saveGuildDelegate(prisma, {
    guildId,
    userId,
    username,
    avatar: null,
    modules,
    grantedById: 'admin',
  });

describe('délégations', () => {
  it('donne des onglets à un membre, puis les remplace (sans doublon)', async () => {
    const guildId = await newGuild();

    await grant(guildId, 'u1', 'Faye', ['TD2']);
    expect(await findDelegatedModules(prisma, guildId, 'u1')).toEqual(['TD2']);

    const updated = await grant(guildId, 'u1', 'Faye (renommée)', ['TICKETS', 'TD2', 'TICKETS']);
    expect(updated).toMatchObject({ username: 'Faye (renommée)', modules: ['TICKETS', 'TD2'] });
    expect(await findDelegatedModules(prisma, guildId, 'u2')).toBe(null);
  });

  it('peut donner l’onglet Bienvenue', async () => {
    const guildId = await newGuild();

    const saved = await grant(guildId, 'u1', 'Faye', ['WELCOME']);

    expect(saved.modules).toEqual(['WELCOME']);
    expect(await findDelegatedModules(prisma, guildId, 'u1')).toEqual(['WELCOME']);
  });

  it('liste les membres d’un serveur par pseudo, et les serveurs d’un membre', async () => {
    const guildId = await newGuild();
    const other = await newGuild();
    const left = await newGuild();
    await grant(guildId, 'zed', 'Zed', ['ROLES']);
    await grant(guildId, 'ann', 'Ann', ['TD2']);
    await grant(other, 'ann', 'Ann', ['TICKETS']);
    await grant(left, 'ann', 'Ann', ['TD2']);
    await prisma.guild.update({ where: { id: left }, data: { leftAt: new Date() } });

    expect((await listGuildDelegates(prisma, guildId)).map((d) => d.username)).toEqual([
      'Ann',
      'Zed',
    ]);
    // Les serveurs quittés par le bot n'apparaissent plus
    const delegations = await listDelegationsOf(prisma, 'ann');
    expect(
      delegations
        .filter((d) => [guildId, other, left].includes(d.guildId))
        .toSorted((a, b) => a.guildId.localeCompare(b.guildId)),
    ).toEqual(
      [
        { guildId, modules: ['TD2'] },
        { guildId: other, modules: ['TICKETS'] },
      ].toSorted((a, b) => a.guildId.localeCompare(b.guildId)),
    );
  });

  it('retire les accès, une seule fois ; et tout part avec le serveur', async () => {
    const guildId = await newGuild();
    await grant(guildId, 'u1', 'Faye', ['TD2']);
    await grant(guildId, 'u2', 'Spike', ['TD2']);

    expect(await deleteGuildDelegate(prisma, guildId, 'u1')).toBe(true);
    expect(await deleteGuildDelegate(prisma, guildId, 'u1')).toBe(false);

    await prisma.guild.delete({ where: { id: guildId } });
    expect(await prisma.guildDelegate.count({ where: { guildId } })).toBe(0);
  });
});
