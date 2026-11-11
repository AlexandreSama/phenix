import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import { seedTd2Catalogue } from './td2-catalogue.js';
import { createTd2Directive } from './td2-directives.js';
import {
  cancelTd2Event,
  createTd2Event,
  createTd2Mission,
  findPublicTd2Guild,
  joinTd2Event,
  listPublicTd2Events,
  listTd2Activities,
  listUpcomingTd2Events,
  setTd2EventDirectives,
  td2EventKind,
} from './td2-events.js';

const prisma = createPrismaClient(inject('databaseUrl'));
const NOW = new Date('2026-11-09T12:00:00Z');
const SATURDAY = new Date('2026-11-14T20:00:00Z');
const run = newGuildId().slice(-8);

let darkHoursNormal = 0;

beforeAll(async () => {
  await seedTd2Catalogue(prisma);
  const raids = await listTd2Activities(prisma, 'RAID');
  darkHoursNormal = raids
    .find((activity) => activity.name === 'Dark Hours')
    ?.modes.find((mode) => mode.name === 'Normal')?.id as number;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function newGuild(publicListing = false) {
  const id = newGuildId();
  await prisma.guild.create({
    data: {
      id,
      name: `Serveur ${id.slice(-4)}`,
      config: { create: { td2PublicListing: publicListing, td2ChannelId: '400000000000000009' } },
    },
  });
  return id;
}

async function newMission(guildId: string, players = 4, scheduledAt = SATURDAY) {
  return createTd2Mission(prisma, {
    guildId,
    missionName: 'Capitole — farm exotiques',
    difficulty: 'HEROIC',
    players,
    scheduledAt,
    channelId: '400000000000000001',
    organizerId: '1',
  });
}

async function newDirective(name: string, active = true) {
  const created = await createTd2Directive(prisma, { name: `${name} ${run}`, description: null });
  if (!created.id) throw new Error('directive non créée');
  if (!active) await prisma.td2Directive.update({ where: { id: created.id }, data: { active } });
  return created.id;
}

describe('missions', () => {
  it('se crée sans activité, avec une seule sorte de place : joueur', async () => {
    const mission = await newMission(await newGuild(), 3);

    expect(mission).toMatchObject({
      modeId: null,
      mode: null,
      missionName: 'Capitole — farm exotiques',
      difficulty: 'HEROIC',
      directives: [],
    });
    expect(mission.slots.map(({ role, count }) => [role, count])).toEqual([['PLAYER', 3]]);
    expect(td2EventKind(mission)).toBe('MISSION');
  });

  it('confirme les joueurs jusqu’à la dernière place, puis met en réserve', async () => {
    const mission = await newMission(await newGuild(), 2);
    const join = (userId: string, role: 'PLAYER' | 'DPS') =>
      joinTd2Event(prisma, mission.id, userId, role, NOW);

    expect(await join('a', 'PLAYER')).toMatchObject({ signupStatus: 'CONFIRMED' });
    expect(await join('b', 'PLAYER')).toMatchObject({ signupStatus: 'CONFIRMED' });
    expect(await join('c', 'PLAYER')).toMatchObject({ signupStatus: 'RESERVE' });
    // Pas de rôle de raid dans une mission…
    expect(await join('d', 'DPS')).toEqual({ status: 'no-slot' });
  });

  it('…ni de place « joueur » dans un raid', async () => {
    const raid = await createTd2Event(prisma, {
      guildId: await newGuild(),
      modeId: darkHoursNormal,
      scheduledAt: SATURDAY,
      channelId: '400000000000000001',
      organizerId: '1',
    });

    expect(await joinTd2Event(prisma, raid!.id, 'a', 'PLAYER', NOW)).toEqual({
      status: 'no-slot',
    });
  });
});

describe('directives', () => {
  it('copie les noms des directives actives choisies, par ordre alphabétique', async () => {
    const mission = await newMission(await newGuild());
    const fog = await newDirective('Brouillard');
    const ammo = await newDirective('Munitions');
    const retired = await newDirective('Ancienne', false);

    const updated = await setTd2EventDirectives(prisma, mission.id, [ammo, retired, fog], NOW);

    expect(updated).toMatchObject({ directives: [`Brouillard ${run}`, `Munitions ${run}`] });
    // Une liste vide les retire toutes
    expect(await setTd2EventDirectives(prisma, mission.id, [], NOW)).toMatchObject({
      directives: [],
    });
  });

  it('refuse un raid, une mission terminée ou annulée, une sortie inconnue', async () => {
    const guildId = await newGuild();
    const raid = await createTd2Event(prisma, {
      guildId,
      modeId: darkHoursNormal,
      scheduledAt: SATURDAY,
      channelId: '1',
      organizerId: '1',
    });
    const mission = await newMission(guildId);
    const later = new Date(SATURDAY.getTime() + 1000);

    expect(await setTd2EventDirectives(prisma, raid!.id, [], NOW)).toBe('not-mission');
    expect(await setTd2EventDirectives(prisma, mission.id, [], later)).toBe('closed');
    await cancelTd2Event(prisma, mission.id, NOW);
    expect(await setTd2EventDirectives(prisma, mission.id, [], NOW)).toBe('closed');
    expect(await setTd2EventDirectives(prisma, 999_999, [], NOW)).toBe(null);
  });
});

describe('aperçus et page publique', () => {
  it('résume une mission : son nom à la place de l’activité, sa difficulté, ses directives', async () => {
    const guildId = await newGuild();
    const mission = await newMission(guildId);
    const fog = await newDirective('Brouillard aperçu');
    await setTd2EventDirectives(prisma, mission.id, [fog], NOW);
    await joinTd2Event(prisma, mission.id, 'a', 'PLAYER', NOW);

    const [overview] = await listUpcomingTd2Events(prisma, guildId, NOW);

    expect(overview).toEqual({
      id: mission.id,
      kind: 'MISSION',
      activity: 'Capitole — farm exotiques',
      mode: null,
      difficulty: 'HEROIC',
      directives: [`Brouillard aperçu ${run}`],
      scheduledAt: SATURDAY,
      channelId: '400000000000000001',
      confirmed: 1,
      capacity: 4,
      reserve: 0,
    });
  });

  it('ne montre que les serveurs qui l’ont choisi, où le bot est encore, et les sorties à venir', async () => {
    const shown = await newGuild(true);
    const hidden = await newGuild(false);
    const left = await newGuild(true);
    await prisma.guild.update({ where: { id: left }, data: { leftAt: NOW, icon: null } });
    await prisma.guild.update({ where: { id: shown }, data: { icon: 'a_icone' } });

    const sunday = new Date('2026-11-15T19:00:00Z');
    const later = await newMission(shown, 4, sunday);
    const sooner = await createTd2Event(prisma, {
      guildId: shown,
      modeId: darkHoursNormal,
      scheduledAt: SATURDAY,
      channelId: '1',
      organizerId: '1',
    });
    const cancelled = await newMission(shown);
    await cancelTd2Event(prisma, cancelled.id, NOW);
    const past = await newMission(shown, 4, new Date('2026-11-01T20:00:00Z'));
    await newMission(hidden);
    await newMission(left);

    const all = await listPublicTd2Events(prisma, NOW);
    const mine = all.filter((event) => [shown, hidden, left].includes(event.guild.id));

    expect(mine.map((event) => event.id)).toEqual([sooner!.id, later.id]);
    expect(mine.map((event) => event.id)).not.toContain(past.id);
    expect(mine[0]).toMatchObject({
      kind: 'RAID',
      activity: 'Dark Hours',
      guild: { id: shown, name: expect.stringMatching(/^Serveur /), icon: 'a_icone' },
    });
  });

  it('retrouve un serveur public et son salon TD2, pas les autres', async () => {
    const shown = await newGuild(true);
    const hidden = await newGuild(false);

    expect(await findPublicTd2Guild(prisma, shown)).toMatchObject({
      id: shown,
      config: { td2ChannelId: '400000000000000009' },
    });
    expect(await findPublicTd2Guild(prisma, hidden)).toBe(null);
    expect(await findPublicTd2Guild(prisma, 'inconnu')).toBe(null);
  });
});
