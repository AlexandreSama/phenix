import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env.js';
import { MetricsReporterService } from './metrics-reporter.service.js';

const READING = {
  cpu: 2.5,
  memory: 90_000_000,
  memoryLimit: 268_435_456,
  eventLoopDelayMs: 0.8,
  uptime: 120,
  source: 'cgroup' as const,
};
const meter = () => ({ read: vi.fn(async () => READING), stop: vi.fn() });

function setup(nodeEnv: Env['NODE_ENV'] = 'test') {
  const db = { metricSample: { createMany: vi.fn(async () => ({ count: 2 })) } };
  const redis = { set: vi.fn(async () => 'OK') };
  const reporter = new MetricsReporterService(
    db as never,
    redis as never,
    { NODE_ENV: nodeEnv, APP_VERSION: 'abc123' } as Env,
  );
  return { db, redis, reporter };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('MetricsReporterService', () => {
  it('publie son battement tout de suite puis toutes les 30 s, et un relevé toutes les 5 minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-11T09:02:00Z'));
    const { db, redis, reporter } = setup();
    const live = meter();
    const sampler = meter();

    reporter.start(live, sampler);
    await vi.advanceTimersByTimeAsync(0);

    expect(redis.set).toHaveBeenCalledWith(
      'metrics:live:api',
      JSON.stringify({
        at: '2026-11-11T09:02:00.000Z',
        cpu: 2.5,
        memory: 90_000_000,
        memoryLimit: 268_435_456,
        uptime: 120,
        version: 'abc123',
        eventLoopDelayMs: 0.8,
      }),
      'EX',
      90,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(redis.set).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(270_000);
    // 09:07:00 : rangé dans le créneau de 09:05
    const takenAt = new Date('2026-11-11T09:05:00Z');
    expect(db.metricSample.createMany).toHaveBeenCalledWith({
      data: [
        { name: 'api.cpu', takenAt, value: 2.5 },
        { name: 'api.memory', takenAt, value: 90_000_000 },
      ],
      skipDuplicates: true,
    });

    reporter.onModuleDestroy();
    expect(live.stop).toHaveBeenCalled();
    expect(sampler.stop).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(db.metricSample.createMany).toHaveBeenCalledTimes(1);
  });

  it('ne démarre rien tout seul pendant les tests', () => {
    const { reporter } = setup('test');
    const start = vi.spyOn(reporter, 'start');
    reporter.onApplicationBootstrap();
    expect(start).not.toHaveBeenCalled();
  });

  it('démarre en dev et en production', () => {
    const { reporter } = setup('production');
    const start = vi.spyOn(reporter, 'start').mockImplementation(() => {});
    reporter.onApplicationBootstrap();
    expect(start).toHaveBeenCalledTimes(1);
    reporter.onModuleDestroy();
  });
});
