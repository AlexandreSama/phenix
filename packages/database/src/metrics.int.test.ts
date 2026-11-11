import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { newGuildId } from '../test/ids.js';
import { createPrismaClient } from './client.js';
import {
  commandDailyTotals,
  commandRanking,
  commandTotals,
  databaseStats,
  guildRanking,
  latestStorageSamples,
  metricSeries,
  purgeMetrics,
  recordCommandUsage,
  recordMetricSamples,
} from './metrics.js';

const prisma = createPrismaClient(inject('databaseUrl'));

// Seul ce fichier écrit dans ces tables : ses tests, joués l'un après l'autre, partent d'une base vide
beforeAll(async () => {
  await prisma.commandUsage.deleteMany();
  await prisma.metricSample.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const at = (iso: string) => new Date(iso);
const ALPHA = newGuildId();
const BRAVO = newGuildId();
const usage = (hour: string, guildId: string, command: string, count = 1, errors = 0) => ({
  hour: at(hour),
  guildId,
  command,
  count,
  errors,
  totalDurationMs: count * 100,
});

describe('compteurs de commandes', () => {
  it('cumule les lots d’une même heure au lieu de les remplacer', async () => {
    await prisma.guild.create({ data: { id: ALPHA, name: 'Alpha', icon: 'abc' } });
    await recordCommandUsage(prisma, [usage('2026-11-10T08:00:00Z', ALPHA, 'ping', 2)]);
    await recordCommandUsage(prisma, [
      usage('2026-11-10T08:00:00Z', ALPHA, 'ping', 3, 1),
      usage('2026-11-10T08:00:00Z', ALPHA, 'td2 mission', 1),
    ]);
    await recordCommandUsage(prisma, []);

    const row = await prisma.commandUsage.findUniqueOrThrow({
      where: {
        hour_guildId_command: { hour: at('2026-11-10T08:00:00Z'), guildId: ALPHA, command: 'ping' },
      },
    });
    expect(row).toMatchObject({ count: 5, errors: 1, totalDurationMs: 500 });
  });

  it('classe les commandes et les serveurs sur la plage, sans compter ce qui la précède', async () => {
    await recordCommandUsage(prisma, [
      // Avant la plage : ignoré
      usage('2026-11-01T08:00:00Z', BRAVO, 'ship', 50),
      usage('2026-11-10T21:00:00Z', BRAVO, 'ship', 4),
      usage('2026-11-10T23:00:00Z', BRAVO, 'ping', 1),
      // Hors serveur
      usage('2026-11-10T22:00:00Z', '', 'avatar', 2),
    ]);
    const since = at('2026-11-10T00:00:00Z');

    expect(await commandRanking(prisma, since)).toEqual([
      { command: 'ping', count: 6, errors: 1, avgDurationMs: 100 },
      { command: 'ship', count: 4, errors: 0, avgDurationMs: 100 },
      { command: 'avatar', count: 2, errors: 0, avgDurationMs: 100 },
      { command: 'td2 mission', count: 1, errors: 0, avgDurationMs: 100 },
    ]);
    expect(await commandTotals(prisma, since)).toEqual({ count: 13, errors: 1, guilds: 2 });
    expect(await commandTotals(prisma, at('2030-01-01T00:00:00Z'))).toEqual({
      count: 0,
      errors: 0,
      guilds: 0,
    });

    expect(await guildRanking(prisma, since)).toEqual([
      {
        id: ALPHA,
        name: 'Alpha',
        icon: 'abc',
        count: 6,
        topCommand: 'ping',
        lastActiveAt: '2026-11-10T08:00:00.000Z',
      },
      {
        id: BRAVO,
        name: null,
        icon: null,
        count: 5,
        topCommand: 'ship',
        lastActiveAt: '2026-11-10T23:00:00.000Z',
      },
      {
        id: '',
        name: null,
        icon: null,
        count: 2,
        topCommand: 'avatar',
        lastActiveAt: '2026-11-10T22:00:00.000Z',
      },
    ]);
    expect(await guildRanking(prisma, since, 1)).toHaveLength(1);
  });

  it('compte les jours en heure de Paris', async () => {
    // 23 h UTC le 10 novembre : déjà le 11 à Paris
    expect(await commandDailyTotals(prisma, at('2026-11-10T00:00:00Z'))).toEqual([
      { day: '2026-11-10', count: 12, errors: 1 },
      { day: '2026-11-11', count: 1, errors: 0 },
    ]);
  });
});

describe('relevés', () => {
  it('garde le premier relevé d’un créneau, ignore les valeurs non finies', async () => {
    const takenAt = at('2026-11-10T10:00:00Z');
    expect(
      await recordMetricSamples(prisma, [
        { name: 'bot.cpu', takenAt, value: 10 },
        { name: 'bot.memory', takenAt, value: Number.NaN },
      ]),
    ).toBe(1);
    expect(await recordMetricSamples(prisma, [{ name: 'bot.cpu', takenAt, value: 99 }])).toBe(0);
    expect(await recordMetricSamples(prisma, [])).toBe(0);
    const row = await prisma.metricSample.findUniqueOrThrow({
      where: { name_takenAt: { name: 'bot.cpu', takenAt } },
    });
    expect(row.value).toBe(10);
  });

  it('agrège les courbes par pas, et rend une courbe vide pour un nom sans relevé', async () => {
    const samples = [];
    // 10 h 05 à 11 h 55 : 23 relevés de plus, de 5 en 5 minutes
    for (let minutes = 5; minutes < 120; minutes += 5) {
      samples.push({
        name: 'bot.cpu',
        takenAt: new Date(Date.UTC(2026, 10, 10, 10, minutes)),
        value: minutes < 60 ? 20 : 40,
      });
    }
    await recordMetricSamples(prisma, samples);
    const since = at('2026-11-10T00:00:00Z');

    const hourly = await metricSeries(prisma, ['bot.cpu', 'api.cpu'], since, 60);
    expect(hourly).toEqual([
      {
        name: 'bot.cpu',
        points: [
          // 10 + 11 × 20, sur 12 relevés
          { at: '2026-11-10T10:00:00.000Z', value: (10 + 11 * 20) / 12 },
          { at: '2026-11-10T11:00:00.000Z', value: 40 },
        ],
      },
      { name: 'api.cpu', points: [] },
    ]);

    const fourHours = await metricSeries(prisma, ['bot.cpu'], since, 240);
    expect(fourHours[0]?.points).toEqual([
      { at: '2026-11-10T08:00:00.000Z', value: (10 + 11 * 20 + 12 * 40) / 24 },
    ]);

    const raw = await metricSeries(prisma, ['bot.cpu'], at('2026-11-10T11:50:00Z'), 5);
    expect(raw[0]?.points).toEqual([
      { at: '2026-11-10T11:50:00.000Z', value: 40 },
      { at: '2026-11-10T11:55:00.000Z', value: 40 },
    ]);
    expect(await metricSeries(prisma, [], since, 5)).toEqual([]);
  });

  it('rend le dernier relevé du stockage, sans les relevés du bot ni de l’API', async () => {
    expect(await latestStorageSamples(prisma)).toEqual({ takenAt: null, samples: [] });

    const old = at('2026-11-10T10:00:00Z');
    const last = at('2026-11-10T10:05:00Z');
    await recordMetricSamples(prisma, [
      { name: 'postgres.bytes', takenAt: old, value: 1 },
      { name: 'garage.media.bytes', takenAt: old, value: 5 },
      { name: 'postgres.bytes', takenAt: last, value: 2 },
      { name: 'valkey.bytes', takenAt: last, value: 3 },
      // Plus récent, mais ce n'est pas du stockage
      { name: 'api.memory', takenAt: at('2026-11-10T10:10:00Z'), value: 9 },
    ]);

    expect(await latestStorageSamples(prisma)).toEqual({
      takenAt: '2026-11-10T10:05:00.000Z',
      samples: [
        { name: 'postgres.bytes', value: 2 },
        { name: 'valkey.bytes', value: 3 },
      ],
    });
  });

  it('mesure la base et ses plus grosses tables', async () => {
    const stats = await databaseStats(prisma);
    expect(stats.bytes).toBeGreaterThan(0);
    expect(stats.tables.length).toBeGreaterThan(0);
    expect(stats.tables.length).toBeLessThanOrEqual(5);
    expect(stats.tables.map((table) => table.name)).not.toContain('_prisma_migrations');
    const sizes = stats.tables.map((table) => table.bytes);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });
});

describe('purgeMetrics', () => {
  it('efface relevés et compteurs plus vieux que la date donnée, et seulement eux', async () => {
    const result = await purgeMetrics(prisma, at('2026-11-10T10:05:00Z'));

    // Relevés de 10 h 00 (bot.cpu, postgres.bytes, garage.media.bytes) ; compteurs du 1er et de 8 h
    expect(result).toEqual({ samples: 3, usage: 3 });
    expect(
      await prisma.metricSample.count({ where: { takenAt: { lt: at('2026-11-10T10:05:00Z') } } }),
    ).toBe(0);
    expect(await prisma.metricSample.count()).toBeGreaterThan(0);
    expect(await prisma.commandUsage.count()).toBe(3);
  });
});
