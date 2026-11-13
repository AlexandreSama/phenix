import { Logger } from '@nestjs/common';
import { LockBusyError, LockUnavailableError, moderationLockKey } from '@phenix/jobs';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LockService } from './lock.service.js';

const GUILD = '300000000000000001';
const TARGET = '500000000000000001';
const KEY = moderationLockKey(GUILD, TARGET);

/** Le strict nécessaire de Valkey pour le verrou : SET … PX … NX et le script de libération. */
const store = {
  set: vi.fn(async (..._args: unknown[]): Promise<'OK' | null> => 'OK'),
  eval: vi.fn(async (..._args: unknown[]): Promise<unknown> => 1),
};
const service = () => new LockService(store as unknown as Redis);

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  store.set.mockImplementation(async () => 'OK');
  store.eval.mockImplementation(async () => 1);
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('LockService', () => {
  it('pose le verrou 30 s (PX, NX), exécute la tâche puis le libère', async () => {
    const result = await service().withLock(KEY, async () => 'fait');

    expect(result).toBe('fait');
    expect(store.set).toHaveBeenCalledWith(KEY, expect.any(String), 'PX', 30_000, 'NX');
    expect(store.eval).toHaveBeenCalledTimes(1);
  });

  it('libère le verrou même si la tâche échoue', async () => {
    await expect(
      service().withLock(KEY, async () => {
        throw new Error('bot trop bas');
      }),
    ).rejects.toThrow('bot trop bas');

    expect(store.eval).toHaveBeenCalledTimes(1);
  });

  it('attend au plus 2 s un verrou pris, puis LockBusyError sans exécuter la tâche', async () => {
    vi.useFakeTimers();
    store.set.mockImplementation(async () => null);
    const task = vi.fn(async () => 'fait');

    const attempt = service().withLock(KEY, task);
    const outcome = attempt.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_900);
    expect(store.set.mock.calls.length).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(200);

    expect(await outcome).toBeInstanceOf(LockBusyError);
    expect(task).not.toHaveBeenCalled();
  });

  it('un Valkey muet plus de 1 s devient LockUnavailableError, sans exécuter la tâche', async () => {
    vi.useFakeTimers();
    store.set.mockImplementation(() => new Promise(() => undefined));
    const task = vi.fn(async () => 'fait');

    const attempt = service().withLock(KEY, task);
    const outcome = attempt.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await outcome).toBeInstanceOf(LockUnavailableError);
    expect(task).not.toHaveBeenCalled();
  });

  it('journalise une libération sans propriétaire (TTL dépassé), sans la clé ni la cible', async () => {
    store.eval.mockImplementation(async () => 0);

    await expect(service().withLock(KEY, async () => 'fait')).resolves.toBe('fait');

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('without owner');
    expect(logged).not.toContain(TARGET);
  });

  it('journalise une libération en échec, sans la clé ni la cible, et rend le résultat', async () => {
    store.eval.mockRejectedValue(new Error(`ECONNRESET ${KEY}`));

    await expect(service().withLock(KEY, async () => 'fait')).resolves.toBe('fait');

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('release failed');
    expect(logged).not.toContain(TARGET);
  });
});
