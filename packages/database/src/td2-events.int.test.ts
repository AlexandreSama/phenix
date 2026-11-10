import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPrismaClient } from './client.js';
import { seedTd2Catalogue } from './td2-catalogue.js';
import {
  cancelTd2Event,
  createTd2Event,
  findTd2Event,
  findTd2EventsToResume,
  joinTd2Event,
  leaveTd2Event,
  listTd2Activities,
  listUpcomingTd2Events,
  rescheduleTd2Event,
} from './td2-events.js';
import { newGuildId } from '../test/ids.js';

const prisma = createPrismaClient(inject('databaseUrl'));
const NOW = new Date('2026-11-09T12:00:00Z');
const SATURDAY = new Date('2026-11-14T20:00:00Z');

let darkHoursNormal = 0;
let paradisPerdu = 0;

beforeAll(async () => {
  await seedTd2Catalogue(prisma);
  const raids = await listTd2Activities(prisma, 'RAID');
  darkHoursNormal = raids
    .find((activity) => activity.name === 'Dark Hours')
    ?.modes.find((mode) => mode.name === 'Normal')?.id as number;
  const incursions = await listTd2Activities(prisma, 'INCURSION');
  paradisPerdu = incursions.find((activity) => activity.name === 'Paradis Perdu')?.modes[0]
    ?.id as number;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function newEvent(modeId = darkHoursNormal, scheduledAt = SATURDAY) {
  const guildId = newGuildId();
  await prisma.guild.create({ data: { id: guildId, name: 'Serveur de test' } });
  const event = await createTd2Event(prisma, {
    guildId,
    modeId,
    scheduledAt,
    channelId: '400000000000000001',
    organizerId: '1',
  });
  return event!;
}

const join = (eventId: number, userId: string, role: 'DPS' | 'HEAL' | 'TANK' | 'HEAL_TANK') =>
  joinTd2Event(prisma, eventId, userId, role, NOW);

describe('catalogue et création', () => {
  it('propose les activités par type, et copie la composition du mode dans la sortie', async () => {
    const raids = await listTd2Activities(prisma, 'RAID');
    expect(raids.map((activity) => activity.name)).toEqual(['Dark Hours', 'Iron Horse']);
    expect(raids[0]?.modes.map((mode) => mode.name)).toEqual(['Normal', 'Semi-Speed']);

    const event = await newEvent();
    expect(Object.fromEntries(event.slots.map((slot) => [slot.role, slot.count]))).toEqual({
      DPS: 6,
      HEAL: 1,
      TANK: 1,
    });
    expect(event.mode.activity.name).toBe('Dark Hours');
  });

  it('refuse un mode inconnu', async () => {
    const guildId = newGuildId();
    await prisma.guild.create({ data: { id: guildId, name: 'Serveur de test' } });
    const event = await createTd2Event(prisma, {
      guildId,
      modeId: 999_999,
      scheduledAt: SATURDAY,
      channelId: '1',
      organizerId: '1',
    });
    expect(event).toBe(null);
  });
});

describe('inscriptions', () => {
  it('confirme tant qu’il reste des places, puis met en réserve', async () => {
    const event = await newEvent();

    expect(await join(event.id, 'h1', 'HEAL')).toMatchObject({ signupStatus: 'CONFIRMED' });
    expect(await join(event.id, 'h2', 'HEAL')).toMatchObject({ signupStatus: 'RESERVE' });
    expect(await join(event.id, 'h1', 'HEAL')).toEqual({
      status: 'already',
      role: 'HEAL',
      signupStatus: 'CONFIRMED',
    });
    // Un raid n'a pas de place Heal/Tank
    expect(await join(event.id, 'x', 'HEAL_TANK')).toEqual({ status: 'no-slot' });
  });

  it('la place libérée passe au premier de la réserve du même rôle', async () => {
    const event = await newEvent();
    await join(event.id, 'tank1', 'TANK');
    await join(event.id, 'tank2', 'TANK');
    await join(event.id, 'tank3', 'TANK');

    expect(await leaveTd2Event(prisma, event.id, 'tank1', NOW)).toEqual({
      status: 'left',
      role: 'TANK',
      promoted: [{ userId: 'tank2', role: 'TANK' }],
    });
    // Quitter la réserve ne fait monter personne
    expect(await leaveTd2Event(prisma, event.id, 'tank3', NOW)).toEqual({
      status: 'left',
      role: 'TANK',
      promoted: [],
    });
    expect(await leaveTd2Event(prisma, event.id, 'tank3', NOW)).toEqual({ status: 'not-signed' });
  });

  it('changer de rôle libère l’ancienne place', async () => {
    const event = await newEvent();
    await join(event.id, 'a', 'TANK');
    await join(event.id, 'b', 'TANK'); // réserve

    const result = await join(event.id, 'a', 'HEAL');

    expect(result).toEqual({
      status: 'joined',
      role: 'HEAL',
      signupStatus: 'CONFIRMED',
      previousRole: 'TANK',
      promoted: [{ userId: 'b', role: 'TANK' }],
    });
    const after = await findTd2Event(prisma, event.id);
    expect(after?.signups.map((signup) => [signup.userId, signup.role, signup.status])).toEqual([
      ['b', 'TANK', 'CONFIRMED'],
      ['a', 'HEAL', 'CONFIRMED'],
    ]);
  });

  it('dix clics simultanés pour six places DPS : six confirmés, quatre en réserve', async () => {
    const event = await newEvent();

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => join(event.id, `dps${i}`, 'DPS')),
    );

    const statuses = results.map((result) => ('signupStatus' in result ? result.signupStatus : ''));
    expect(statuses.filter((status) => status === 'CONFIRMED')).toHaveLength(6);
    expect(statuses.filter((status) => status === 'RESERVE')).toHaveLength(4);
  });

  it('une incursion a sa place Heal/Tank', async () => {
    const event = await newEvent(paradisPerdu);
    expect(await join(event.id, 'hybride', 'HEAL_TANK')).toMatchObject({
      signupStatus: 'CONFIRMED',
    });
    expect(await join(event.id, 'tank', 'TANK')).toEqual({ status: 'no-slot' });
  });
});

describe('vie de la sortie', () => {
  it('ferme les inscriptions à l’heure du début et après une annulation', async () => {
    const event = await newEvent();
    const later = new Date(SATURDAY.getTime() + 1000);

    expect(await joinTd2Event(prisma, event.id, 'tard', 'DPS', later)).toEqual({
      status: 'closed',
    });
    expect(await cancelTd2Event(prisma, event.id, NOW)).toMatchObject({ cancelledAt: NOW });
    expect(await join(event.id, 'u', 'DPS')).toEqual({ status: 'closed' });
    expect(await cancelTd2Event(prisma, event.id, NOW)).toBe('closed');
    expect(await rescheduleTd2Event(prisma, 999_999, SATURDAY, NOW)).toBe(null);
  });

  it('change la date d’une sortie à venir', async () => {
    const event = await newEvent();
    const sunday = new Date('2026-11-15T19:00:00Z');

    const moved = await rescheduleTd2Event(prisma, event.id, sunday, NOW);

    expect(moved).toMatchObject({ scheduledAt: sunday });
  });

  it('liste les sorties à venir avec leur remplissage, et celles à reprendre', async () => {
    const event = await newEvent();
    const soon = new Date('2026-11-10T20:00:00Z');
    const other = await prisma.td2Event.create({
      data: {
        guildId: event.guildId,
        modeId: paradisPerdu,
        scheduledAt: soon,
        channelId: '400000000000000001',
        organizerId: '1',
      },
    });
    await join(event.id, 'h1', 'HEAL');
    await join(event.id, 'h2', 'HEAL');

    const upcoming = await listUpcomingTd2Events(prisma, event.guildId, NOW);

    expect(upcoming.map((entry) => entry.id)).toEqual([other.id, event.id]);
    expect(upcoming[1]).toMatchObject({
      kind: 'RAID',
      activity: 'Dark Hours',
      mode: 'Normal',
      confirmed: 1,
      capacity: 8,
      reserve: 1,
    });
    const resume = await findTd2EventsToResume(prisma, [event.guildId], NOW);
    expect(resume.map((entry) => entry.id).toSorted((a, b) => a - b)).toEqual(
      [event.id, other.id].toSorted((a, b) => a - b),
    );
  });
});
