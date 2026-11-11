import { METRICS } from '@phenix/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHeartbeat, type HeartbeatClient } from './heartbeat.js';

const NOW = new Date('2026-11-11T09:00:00Z');
const READING = {
  cpu: 12.5,
  memory: 200_000_000,
  memoryLimit: 536_870_912,
  eventLoopDelayMs: 1.5,
  uptime: 3600,
  source: 'cgroup' as const,
};

function setup(ready = true) {
  const client: HeartbeatClient = {
    isReady: vi.fn(() => ready) as unknown as HeartbeatClient['isReady'],
    guilds: { cache: { size: 12 } },
    ws: { ping: 42 },
  };
  const store = { set: vi.fn(async () => 'OK' as const) };
  const logger = { warn: vi.fn() };
  const meter = { read: vi.fn(async () => READING) };
  const stop = startHeartbeat({ client, store, logger, meter, version: 'abc123', now: () => NOW });
  return { store, logger, meter, stop };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startHeartbeat', () => {
  it('publie l’état du bot tout de suite, puis toutes les 30 secondes, une clé qui expire en 90', async () => {
    const { store, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.set).toHaveBeenCalledWith(
      METRICS.live.keys.bot,
      JSON.stringify({
        at: NOW.toISOString(),
        cpu: 12.5,
        memory: 200_000_000,
        memoryLimit: 536_870_912,
        uptime: 3600,
        version: 'abc123',
        eventLoopDelayMs: 1.5,
        guilds: 12,
        ping: 42,
      }),
      'EX',
      90,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.set).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.set).toHaveBeenCalledTimes(2);
  });

  it('se tait tant que le bot n’est pas connecté à Discord', async () => {
    const { store, meter, stop } = setup(false);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(store.set).not.toHaveBeenCalled();
    expect(meter.read).not.toHaveBeenCalled();
    stop();
  });

  it('une panne de Valkey est journalisée, sans faire tomber le bot', async () => {
    const { store, logger, stop } = setup();
    store.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await vi.advanceTimersByTimeAsync(0);
    expect(logger.warn).toHaveBeenCalled();
    stop();
  });
});
