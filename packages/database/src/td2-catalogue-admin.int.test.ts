import { afterAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import {
  createTd2Activity,
  createTd2Mode,
  deleteTd2Mode,
  listTd2Catalogue,
  updateTd2Activity,
  updateTd2Mode,
  type Td2Composition,
} from './td2-catalogue-admin.js';

const prisma = createPrismaClient(inject('databaseUrl'));

afterAll(async () => {
  await prisma.$disconnect();
});

// Des noms propres à ce lancement : le catalogue est partagé par tous les tests
const run = newGuildId().slice(-8);
const slots = (composition: Partial<Td2Composition>): Td2Composition => ({
  DPS: 0,
  HEAL: 0,
  TANK: 0,
  HEAL_TANK: 0,
  ...composition,
});

async function newActivity(name: string, kind: 'RAID' | 'INCURSION' = 'RAID') {
  const created = await createTd2Activity(prisma, { kind, name: `${name} ${run}` });
  if (!created.id) throw new Error('activité non créée');
  return created.id;
}

describe('activités', () => {
  it('ajoute, refuse un doublon du même type, accepte le même nom sur l’autre type', async () => {
    const name = `Pentagone ${run}`;

    expect(await createTd2Activity(prisma, { kind: 'RAID', name })).toMatchObject({ status: 'ok' });
    expect(await createTd2Activity(prisma, { kind: 'RAID', name })).toEqual({
      status: 'duplicate',
    });
    expect(await createTd2Activity(prisma, { kind: 'INCURSION', name })).toMatchObject({
      status: 'ok',
    });
  });

  it('renomme et désactive, sans prendre le nom d’une autre', async () => {
    const id = await newActivity('Capitole');
    await newActivity('Arsenal');

    expect(await updateTd2Activity(prisma, id, { name: `Arsenal ${run}` })).toEqual({
      status: 'duplicate',
    });
    expect(
      await updateTd2Activity(prisma, id, { name: `Capitole II ${run}`, active: false }),
    ).toEqual({ status: 'ok' });
    expect(await updateTd2Activity(prisma, 999_999, { active: true })).toEqual({
      status: 'missing',
    });

    const activity = (await listTd2Catalogue(prisma)).find((entry) => entry.id === id);
    expect(activity).toMatchObject({ name: `Capitole II ${run}`, active: false });
  });
});

describe('modes', () => {
  it('ajoute un mode et sa composition, sans enregistrer les rôles à zéro', async () => {
    const activityId = await newActivity('Tidal Basin');

    const created = await createTd2Mode(prisma, activityId, {
      name: 'Normal',
      slots: slots({ DPS: 6, HEAL: 1, TANK: 1 }),
    });

    expect(created).toMatchObject({ status: 'ok' });
    expect(
      await prisma.td2ModeSlot.findMany({
        where: { modeId: created.id },
        orderBy: { role: 'asc' },
      }),
    ).toEqual([
      { modeId: created.id, role: 'DPS', count: 6 },
      { modeId: created.id, role: 'HEAL', count: 1 },
      { modeId: created.id, role: 'TANK', count: 1 },
    ]);
    expect(
      await createTd2Mode(prisma, activityId, { name: 'Normal', slots: slots({ DPS: 1 }) }),
    ).toEqual({ status: 'duplicate' });
    expect(
      await createTd2Mode(prisma, 999_999, { name: 'Normal', slots: slots({ DPS: 1 }) }),
    ).toEqual({ status: 'missing' });
  });

  it('change une composition : le catalogue suit', async () => {
    const activityId = await newActivity('Roosevelt');
    const { id } = await createTd2Mode(prisma, activityId, {
      name: 'Normal',
      slots: slots({ DPS: 6, HEAL: 1, TANK: 1 }),
    });

    expect(
      await updateTd2Mode(prisma, id!, {
        name: 'Semi-Speed',
        slots: slots({ DPS: 5, HEAL: 1, TANK: 2 }),
      }),
    ).toEqual({ status: 'ok' });

    const activity = (await listTd2Catalogue(prisma)).find((entry) => entry.id === activityId);
    expect(activity?.modes).toEqual([
      {
        id,
        name: 'Semi-Speed',
        slots: { DPS: 5, HEAL: 1, TANK: 2, HEAL_TANK: 0 },
        eventCount: 0,
      },
    ]);
  });

  it('refuse de supprimer un mode qu’une sortie utilise', async () => {
    const activityId = await newActivity('Kenly', 'INCURSION');
    const { id: modeId } = await createTd2Mode(prisma, activityId, {
      name: 'Standard',
      slots: slots({ DPS: 3, HEAL_TANK: 1 }),
    });
    const unused = await createTd2Mode(prisma, activityId, {
      name: 'Libre',
      slots: slots({ DPS: 4 }),
    });
    const guildId = newGuildId();
    await prisma.guild.create({ data: { id: guildId, name: 'Serveur de test' } });
    await prisma.td2Event.create({
      data: {
        guildId,
        modeId: modeId!,
        scheduledAt: new Date('2026-11-14T20:00:00Z'),
        channelId: '400000000000000001',
        organizerId: '1',
      },
    });

    expect(await deleteTd2Mode(prisma, modeId!)).toEqual({ status: 'in-use', events: 1 });
    expect(await deleteTd2Mode(prisma, unused.id!)).toEqual({ status: 'ok' });
    expect(await deleteTd2Mode(prisma, unused.id!)).toEqual({ status: 'missing' });
    const activity = (await listTd2Catalogue(prisma)).find((entry) => entry.id === activityId);
    expect(activity?.modes.map((mode) => [mode.name, mode.eventCount])).toEqual([['Standard', 1]]);
  });
});
