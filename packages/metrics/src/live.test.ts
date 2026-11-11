import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseInfoField, slotStart, startLiveHeartbeat } from './live.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('startLiveHeartbeat', () => {
  it('publie tout de suite puis à chaque intervalle, avec expiration', async () => {
    vi.useFakeTimers();
    const store = { set: vi.fn(async () => 'OK') };
    let n = 0;
    const stop = startLiveHeartbeat({
      store,
      key: 'metrics:live:api',
      intervalSeconds: 30,
      ttlSeconds: 90,
      read: async () => ({ n: ++n }),
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(store.set).toHaveBeenLastCalledWith('metrics:live:api', '{"n":1}', 'EX', 90);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.set).toHaveBeenLastCalledWith('metrics:live:api', '{"n":2}', 'EX', 90);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.set).toHaveBeenCalledTimes(2);
  });

  it('se tait quand read rend null, et signale les erreurs sans s’arrêter', async () => {
    vi.useFakeTimers();
    const store = { set: vi.fn().mockRejectedValueOnce(new Error('Valkey absent')) };
    const onError = vi.fn();
    const states = [{ ok: 1 }, null, { ok: 3 }];
    const stop = startLiveHeartbeat({
      store,
      key: 'k',
      intervalSeconds: 1,
      ttlSeconds: 3,
      read: async () => states.shift() ?? null,
      onError,
    });

    await vi.advanceTimersByTimeAsync(2000);
    stop();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Valkey absent' }));
    expect(store.set).toHaveBeenCalledTimes(2);
    expect(store.set).toHaveBeenLastCalledWith('k', '{"ok":3}', 'EX', 3);
  });
});

describe('slotStart', () => {
  it('aligne une date sur le début de son créneau', () => {
    const step = 5 * 60_000;
    expect(slotStart(new Date('2026-11-11T10:07:59.999Z'), step).toISOString()).toBe(
      '2026-11-11T10:05:00.000Z',
    );
    expect(slotStart(new Date('2026-11-11T10:05:00.000Z'), step).toISOString()).toBe(
      '2026-11-11T10:05:00.000Z',
    );
  });
});

describe('parseInfoField', () => {
  it('lit un champ de INFO memory, avec ou sans retour chariot', () => {
    const info = '# Memory\r\nused_memory:1048576\r\nused_memory_human:1.00M\r\nmaxmemory:0\r\n';
    expect(parseInfoField(info, 'used_memory')).toBe(1_048_576);
    expect(parseInfoField(info, 'maxmemory')).toBe(0);
    expect(parseInfoField('used_memory:12\n', 'used_memory')).toBe(12);
    expect(parseInfoField(info, 'used_memory_peak')).toBeNull();
  });
});
