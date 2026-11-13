import { Redis } from 'ioredis';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { LockBusyError, LockNotOwnedError, createLock, moderationLockKey } from './index.js';

const redis = new Redis(inject('redisUrl'));
afterAll(async () => {
  await redis.quit();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const options = { ttlMs: 5_000, waitMs: 3_000, retryMs: 20, timeoutMs: 2_000 };
let counter = 0;
const uniqueKey = () => `test:lock:${Date.now()}:${counter++}`;

describe('verrou sur un vrai Valkey', () => {
  it('sérialise deux withLock sur la même clé', async () => {
    const lock = createLock(redis, options);
    const key = uniqueKey();
    const events: string[] = [];
    const section = (name: string) => async () => {
      events.push(`${name}:début`);
      await sleep(150);
      events.push(`${name}:fin`);
    };

    await Promise.all([lock.withLock(key, section('A')), lock.withLock(key, section('B'))]);

    expect(events).toHaveLength(4);
    // Jamais de chevauchement : chaque « début » est suivi de la « fin » du même
    expect(events[1]).toBe(events[0]!.replace('début', 'fin'));
    expect(events[3]).toBe(events[2]!.replace('début', 'fin'));
  });

  it('pose réellement un TTL borné par ttlMs, et le retire à la libération', async () => {
    const lock = createLock(redis, options);
    const key = uniqueKey();

    await lock.withLock(key, async () => {
      const ttl = await redis.pttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(options.ttlMs);
    });

    expect(await redis.exists(key)).toBe(0);
  });

  it('après expiration, un autre propriétaire prend le verrou ; la libération de A n’efface pas celui de B', async () => {
    const key = uniqueKey();
    const errors: unknown[] = [];
    const a = createLock(redis, {
      ...options,
      ttlMs: 100,
      waitMs: 0,
      onReleaseError: (error) => errors.push(error),
    });
    const b = createLock(redis, { ...options, waitMs: 0 });
    let tokenOfB: string | null = null;

    const running = a.withLock(key, () => sleep(300)); // le TTL de A expire à 100 ms
    await sleep(150);
    // B prend la clé expirée, et la tient pendant que A termine puis libère
    const takenByB = b.withLock(key, async () => {
      tokenOfB = await redis.get(key);
      await sleep(400);
    });
    await running;

    expect(tokenOfB).not.toBeNull();
    // A a libéré avec son ancien jeton : la clé de B est intacte, et le fait est signalé
    expect(await redis.get(key)).toBe(tokenOfB);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(LockNotOwnedError);
    await takenByB;
    expect(await redis.exists(key)).toBe(0);
  });

  it('deux cibles différentes ne se bloquent pas', async () => {
    const lock = createLock(redis, { ...options, waitMs: 0 });
    const one = moderationLockKey('123456789012345678', '111111111111111111');
    const two = moderationLockKey('123456789012345678', '222222222222222222');

    await lock.withLock(one, async () => {
      await expect(lock.withLock(two, async () => 'libre')).resolves.toBe('libre');
      await expect(lock.withLock(one, async () => 'x')).rejects.toBeInstanceOf(LockBusyError);
    });
  });
});
