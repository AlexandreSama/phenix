import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMetricsProcessor } from './processor.js';

const READING = {
  cpu: 4.2,
  memory: 150_000_000,
  memoryLimit: null,
  eventLoopDelayMs: 1,
  uptime: 10,
  source: 'process' as const,
};

function setup(overrides: { garage?: unknown; info?: () => Promise<string> } = {}) {
  const db = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ bytes: 9_000_000 }])
      .mockResolvedValueOnce([{ name: 'Case', bytes: 1000 }]),
    metricSample: {
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      deleteMany: vi.fn(async () => ({ count: 7 })),
    },
    commandUsage: { deleteMany: vi.fn(async () => ({ count: 2 })) },
  };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const process = createMetricsProcessor({
    db: db as never,
    redis: { info: overrides.info ?? (async () => '# Memory\r\nused_memory:2048\r\n') },
    garage: ('garage' in overrides
      ? overrides.garage
      : {
          bucketStats: async () => [
            { name: 'media', bytes: 4096, objects: 2 },
            { name: 'transcripts', bytes: 100, objects: 1 },
          ],
        }) as never,
    meter: { read: async () => READING },
    logger,
  });
  return { db, logger, process };
}

const written = (db: ReturnType<typeof setup>['db']) => {
  const call = db.metricSample.createMany.mock.calls[0];
  if (!call) throw new Error('Aucun relevé écrit');
  return (call[0] as { data: unknown[] }).data;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMetricsProcessor', () => {
  it('relève le bot, Postgres, Valkey et chaque bucket au début du créneau', async () => {
    const { db, process } = setup();

    await process({ name: 'sample', scheduledAt: new Date('2026-11-11T10:07:30Z') });

    const takenAt = new Date('2026-11-11T10:05:00Z');
    expect(written(db)).toEqual([
      { name: 'bot.cpu', value: 4.2, takenAt },
      { name: 'bot.memory', value: 150_000_000, takenAt },
      { name: 'postgres.bytes', value: 9_000_000, takenAt },
      { name: 'valkey.bytes', value: 2048, takenAt },
      { name: 'garage.media.bytes', value: 4096, takenAt },
      { name: 'garage.media.objects', value: 2, takenAt },
      { name: 'garage.transcripts.bytes', value: 100, takenAt },
      { name: 'garage.transcripts.objects', value: 1, takenAt },
    ]);
    expect(db.metricSample.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('une source en panne n’empêche pas les autres, et sans Garage configuré on s’en passe', async () => {
    const { db, logger, process } = setup({
      garage: undefined,
      info: async () => {
        throw new Error('Valkey absent');
      },
    });

    await process({ name: 'sample', scheduledAt: new Date('2026-11-11T10:05:00Z') });

    expect((written(db) as { name: string }[]).map((sample) => sample.name)).toEqual([
      'bot.cpu',
      'bot.memory',
      'postgres.bytes',
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'valkey' }),
      'Relevé impossible',
    );
  });

  it('purge ce qui a plus de 30 jours', async () => {
    const { db, logger, process } = setup();

    await process({ name: 'purge', scheduledAt: new Date('2026-12-11T03:00:00Z') });

    const before = new Date('2026-11-11T03:00:00Z');
    expect(db.metricSample.deleteMany).toHaveBeenCalledWith({ where: { takenAt: { lt: before } } });
    expect(db.commandUsage.deleteMany).toHaveBeenCalledWith({ where: { hour: { lt: before } } });
    expect(logger.info).toHaveBeenCalledWith({ samples: 7, usage: 2, before }, expect.any(String));
    expect(db.metricSample.createMany).not.toHaveBeenCalled();
  });
});
