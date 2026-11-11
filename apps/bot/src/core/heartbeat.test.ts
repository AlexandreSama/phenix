import { BOT_HEARTBEAT } from '@phenix/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHeartbeat, type HeartbeatClient } from './heartbeat.js';

const NOW = new Date('2026-11-11T09:00:00Z');

function setup(ready = true) {
  const client: HeartbeatClient = {
    isReady: vi.fn(() => ready) as unknown as HeartbeatClient['isReady'],
    guilds: { cache: { size: 12 } },
    ws: { ping: 42 },
  };
  const redis = { set: vi.fn(async () => 'OK' as const) };
  const logger = { warn: vi.fn() };
  const stop = startHeartbeat(client, redis as never, logger as never, () => NOW);
  return { redis, logger, stop };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startHeartbeat', () => {
  it('écrit tout de suite, puis toutes les 30 secondes, une clé qui expire en 90', () => {
    const { redis, stop } = setup();

    expect(redis.set).toHaveBeenCalledWith(
      BOT_HEARTBEAT.key,
      JSON.stringify({ at: NOW.toISOString(), guilds: 12, ping: 42 }),
      'EX',
      90,
    );
    vi.advanceTimersByTime(30_000);
    expect(redis.set).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(60_000);
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('se tait tant que le bot n’est pas connecté à Discord', () => {
    const { redis, stop } = setup(false);

    vi.advanceTimersByTime(60_000);

    expect(redis.set).not.toHaveBeenCalled();
    stop();
  });

  it('une panne de Valkey est journalisée, sans faire tomber le bot', async () => {
    const { redis, logger, stop } = setup();
    redis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    vi.advanceTimersByTime(30_000);
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalled());
    stop();
  });
});
