import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LockBusyError,
  LockNotOwnedError,
  LockUnavailableError,
  createLock,
  moderationLockKey,
  type LockStore,
} from './lock.js';

const options = { ttlMs: 10_000, waitMs: 1_000, retryMs: 100, timeoutMs: 500 };

/** Faux magasin : `set` rend « OK » ou `null` (clé prise), `eval` rend le nombre de clés supprimées. */
const fakeStore = (overrides: { set?: LockStore['set']; eval?: LockStore['eval'] } = {}) => ({
  set: vi.fn<LockStore['set']>(overrides.set ?? (async () => 'OK')),
  eval: vi.fn<LockStore['eval']>(overrides.eval ?? (async () => 1)),
});

/** Callback de journal qui plante, et opération du magasin qui ne répond jamais. */
const throwing = () =>
  vi.fn(() => {
    throw new Error('le journal a planté');
  });
const never = () => new Promise<never>(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('withLock : prise et libération', () => {
  it('prend la clé avec SET … PX ttl NX et un jeton aléatoire, et rend le résultat de fn', async () => {
    const store = fakeStore();
    const result = await createLock(store, options).withLock('k', async () => 42);

    expect(result).toBe(42);
    expect(store.set).toHaveBeenCalledWith(
      'k',
      expect.stringMatching(/^[\w-]{16,}$/),
      'PX',
      10_000,
      'NX',
    );
  });

  it('utilise un jeton distinct à chaque prise', async () => {
    const store = fakeStore();
    const lock = createLock(store, options);
    await lock.withLock('k', async () => undefined);
    await lock.withLock('k', async () => undefined);

    const [first, second] = store.set.mock.calls.map((call) => call[1]);
    expect(first).not.toBe(second);
  });

  it('libère par un script compare-and-delete avec son propre jeton', async () => {
    const store = fakeStore();
    await createLock(store, options).withLock('k', async () => undefined);

    const token = store.set.mock.calls[0]![1];
    expect(store.eval).toHaveBeenCalledTimes(1);
    const [script, numKeys, key, given] = store.eval.mock.calls[0]!;
    expect(script).toMatch(/get.*KEYS\[1\].*ARGV\[1\]/s);
    expect(script).toContain('del');
    expect([numKeys, key, given]).toEqual([1, 'k', token]);
  });

  it('libère aussi quand fn lève, et relance l’erreur de fn', async () => {
    const store = fakeStore();
    const boom = new Error('boom');

    await expect(
      createLock(store, options).withLock('k', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(store.eval).toHaveBeenCalledTimes(1);
  });

  it('un échec de libération ne masque pas le résultat : il est signalé à onReleaseError', async () => {
    const failure = new Error('valkey coupé');
    const store = fakeStore({ eval: vi.fn().mockRejectedValue(failure) });
    const onReleaseError = vi.fn();

    const result = await createLock(store, { ...options, onReleaseError }).withLock(
      'k',
      async () => 'ok',
    );

    expect(result).toBe('ok');
    expect(onReleaseError).toHaveBeenCalledWith(expect.any(LockUnavailableError), 'k');
    expect(onReleaseError.mock.calls[0]![0].cause).toBe(failure);
  });

  it('un échec de libération ne masque pas non plus l’erreur de fn', async () => {
    const store = fakeStore({ eval: vi.fn().mockRejectedValue(new Error('valkey coupé')) });
    const boom = new Error('boom');

    await expect(
      createLock(store, { ...options, onReleaseError: vi.fn() }).withLock('k', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('une libération sans propriétaire (TTL expiré) est signalée, sans lever', async () => {
    const store = fakeStore({ eval: vi.fn().mockResolvedValue(0) });
    const onReleaseError = vi.fn();

    await expect(
      createLock(store, { ...options, onReleaseError }).withLock('k', async () => 'ok'),
    ).resolves.toBe('ok');
    expect(onReleaseError).toHaveBeenCalledWith(expect.any(LockNotOwnedError), 'k');
  });

  it('une libération qui ne répond pas dans timeoutMs est signalée, sans bloquer', async () => {
    const store = fakeStore({ eval: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const onReleaseError = vi.fn();

    const running = createLock(store, { ...options, onReleaseError }).withLock(
      'k',
      async () => 'ok',
    );
    await vi.advanceTimersByTimeAsync(options.timeoutMs);

    await expect(running).resolves.toBe('ok');
    expect(onReleaseError).toHaveBeenCalledWith(expect.any(LockUnavailableError), 'k');
  });
});

describe('withLock : libération sans onReleaseError', () => {
  it('eval qui rejette : withLock résout avec le résultat de fn', async () => {
    const store = fakeStore({ eval: vi.fn().mockRejectedValue(new Error('valkey coupé')) });

    await expect(createLock(store, options).withLock('k', async () => 'ok')).resolves.toBe('ok');
  });

  it('eval qui rend 0 : withLock résout avec le résultat de fn', async () => {
    const store = fakeStore({ eval: vi.fn().mockResolvedValue(0) });

    await expect(createLock(store, options).withLock('k', async () => 'ok')).resolves.toBe('ok');
  });

  it('eval qui rejette et fn qui lève : l’erreur de fn est relancée', async () => {
    const store = fakeStore({ eval: vi.fn().mockRejectedValue(new Error('valkey coupé')) });
    const boom = new Error('boom');

    await expect(
      createLock(store, options).withLock('k', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});

describe('withLock : onReleaseError qui lève', () => {
  it('libération en échec : withLock résout quand même avec le résultat de fn', async () => {
    const store = fakeStore({ eval: vi.fn().mockRejectedValue(new Error('valkey coupé')) });
    const onReleaseError = throwing();

    await expect(
      createLock(store, { ...options, onReleaseError }).withLock('k', async () => 'ok'),
    ).resolves.toBe('ok');
    expect(onReleaseError).toHaveBeenCalledTimes(1);
  });

  it('verrou expiré (eval → 0) : withLock résout quand même avec le résultat de fn', async () => {
    const store = fakeStore({ eval: vi.fn().mockResolvedValue(0) });
    const onReleaseError = throwing();

    await expect(
      createLock(store, { ...options, onReleaseError }).withLock('k', async () => 'ok'),
    ).resolves.toBe('ok');
    expect(onReleaseError).toHaveBeenCalledTimes(1);
  });

  it('fn qui lève : c’est l’erreur de fn qui est relancée, pas celle du callback', async () => {
    const store = fakeStore({ eval: vi.fn().mockRejectedValue(new Error('valkey coupé')) });
    const boom = new Error('boom');

    await expect(
      createLock(store, { ...options, onReleaseError: throwing() }).withLock('k', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});

describe('withLock : minuteurs', () => {
  it('ne laisse aucun minuteur après un withLock réussi (le délai est annulé)', async () => {
    const store = fakeStore();

    await createLock(store, options).withLock('k', async () => 'ok');

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('withLock : verrou pris', () => {
  it('réessaie toutes les retryMs jusqu’à obtenir le verrou', async () => {
    const store = fakeStore({
      set: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue('OK'),
    });
    const fn = vi.fn().mockResolvedValue('ok');

    const running = createLock(store, options).withLock('k', fn);
    await vi.advanceTimersByTimeAsync(99);
    expect(store.set).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.set).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);

    await expect(running).resolves.toBe('ok');
    expect(store.set).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('lève LockBusyError après waitMs, sans jamais appeler fn', async () => {
    const store = fakeStore({ set: vi.fn().mockResolvedValue(null) });
    const fn = vi.fn();

    const outcome = createLock(store, options)
      .withLock('k', fn)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(options.waitMs);

    expect(await outcome).toBeInstanceOf(LockBusyError);
    expect(fn).not.toHaveBeenCalled();
    // Le dernier essai est à 900 ms : à 1000 ms il ne reste plus de budget (max(waitMs, timeoutMs))
    expect(store.set).toHaveBeenCalledTimes(options.waitMs / options.retryMs);
    expect(store.eval).not.toHaveBeenCalled();
  });

  it('waitMs 0 : un seul essai', async () => {
    const store = fakeStore({ set: vi.fn().mockResolvedValue(null) });
    const fn = vi.fn();

    await expect(
      createLock(store, { ...options, waitMs: 0 }).withLock('k', fn),
    ).rejects.toBeInstanceOf(LockBusyError);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('withLock : attente bornée', () => {
  it('waitMs 250, retryMs 100 : essais aux instants 0, 100, 200 et 250', async () => {
    const attempts: number[] = [];
    const start = Date.now();
    const store = fakeStore({
      set: vi.fn(async () => {
        attempts.push(Date.now() - start);
        return null;
      }),
    });

    const outcome = createLock(store, { ...options, waitMs: 250, retryMs: 100 })
      .withLock('k', vi.fn())
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await outcome).toBeInstanceOf(LockBusyError);
    expect(attempts).toEqual([0, 100, 200, 250]);
  });

  it('un magasin lent (900 ms pour répondre « pris ») : LockBusyError au plus tard à max(waitMs, timeoutMs)', async () => {
    const slow = { ...options, waitMs: 1_000, timeoutMs: 1_000 };
    const store = fakeStore({
      set: vi.fn(() => new Promise<null>((resolve) => setTimeout(() => resolve(null), 900))),
    });
    const start = Date.now();
    let settledAfter = Infinity;

    const outcome = createLock(store, slow)
      .withLock('k', vi.fn())
      .catch((error: unknown) => {
        settledAfter = Date.now() - start;
        return error;
      });
    await vi.advanceTimersByTimeAsync(slow.waitMs + slow.timeoutMs);

    expect(await outcome).toBeInstanceOf(LockBusyError);
    expect(settledAfter).toBeLessThanOrEqual(Math.max(slow.waitMs, slow.timeoutMs));
  });
});

/** Lance `withLock` et rend l'issue avec le temps simulé écoulé jusqu'au règlement. */
const timed = async (
  store: ReturnType<typeof fakeStore>,
  opts: { ttlMs: number; waitMs: number; retryMs: number; timeoutMs: number },
) => {
  const start = Date.now();
  let settledAfter = Infinity;
  const outcome = createLock(store, opts)
    .withLock('k', vi.fn())
    .catch((error: unknown) => {
      settledAfter = Date.now() - start;
      return error;
    });
  await vi.advanceTimersByTimeAsync(10_000);
  return { error: await outcome, settledAfter };
};

describe('withLock : budget total de la prise', () => {
  it('waitMs 1000 / timeoutMs 1000 : un dernier SET muet est abandonné à 1000 ms au plus tard, et le jeton tenté est libéré', async () => {
    const set = vi.fn<LockStore['set']>().mockResolvedValue(null);
    set.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    set.mockImplementationOnce(never);
    const store = fakeStore({ set });
    const opts = { ttlMs: 10_000, waitMs: 1_000, retryMs: 100, timeoutMs: 1_000 };

    const { error, settledAfter } = await timed(store, opts);

    expect(error).toBeInstanceOf(LockUnavailableError);
    expect(settledAfter).toBeLessThanOrEqual(1_000);
    const lastToken = store.set.mock.calls.at(-1)![1];
    expect(store.eval).toHaveBeenCalledTimes(1);
    expect(store.eval.mock.calls[0]![3]).toBe(lastToken);
  });

  it('magasin muet dès le premier essai : LockUnavailableError à max(waitMs, timeoutMs) au plus tard', async () => {
    for (const [waitMs, timeoutMs] of [
      [1_000, 500],
      [250, 500],
      [1_000, 1_000],
    ] as const) {
      const store = fakeStore({ set: vi.fn(never) });
      const { error, settledAfter } = await timed(store, {
        ttlMs: 10_000,
        waitMs,
        retryMs: 100,
        timeoutMs,
      });

      expect(error).toBeInstanceOf(LockUnavailableError);
      expect(settledAfter).toBeLessThanOrEqual(Math.max(waitMs, timeoutMs));
    }
  });

  it('waitMs 0 : un seul essai, qui peut aller jusqu’à timeoutMs', async () => {
    const store = fakeStore({ set: vi.fn(never) });

    const { error, settledAfter } = await timed(store, { ...options, waitMs: 0, timeoutMs: 500 });

    expect(error).toBeInstanceOf(LockUnavailableError);
    expect(settledAfter).toBe(500);
    expect(store.set).toHaveBeenCalledTimes(1);
  });

  it('waitMs 0 et réponse « pris » : LockBusyError sans second essai', async () => {
    const store = fakeStore({ set: vi.fn().mockResolvedValue(null) });

    const { error } = await timed(store, { ...options, waitMs: 0 });

    expect(error).toBeInstanceOf(LockBusyError);
    expect(store.set).toHaveBeenCalledTimes(1);
  });

  it('pas d’essai lancé quand il ne reste que quelques millisecondes de budget', async () => {
    // Essais à 0, 100, … 900 ; à 1000 ms le budget est épuisé : LockBusyError, pas un essai de 0 ms
    const store = fakeStore({ set: vi.fn().mockResolvedValue(null) });

    const { error } = await timed(store, {
      ttlMs: 10_000,
      waitMs: 1_000,
      retryMs: 100,
      timeoutMs: 1_000,
    });

    expect(error).toBeInstanceOf(LockBusyError);
    expect(store.set).toHaveBeenCalledTimes(10);
  });
});

describe('withLock : magasin indisponible', () => {
  it('magasin en erreur : LockUnavailableError avec la cause, fn jamais appelée', async () => {
    const failure = new Error('ECONNREFUSED');
    const store = fakeStore({ set: vi.fn().mockRejectedValue(failure) });
    const fn = vi.fn();

    const error = await createLock(store, options)
      .withLock('k', fn)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LockUnavailableError);
    expect((error as Error).cause).toBe(failure);
    expect(fn).not.toHaveBeenCalled();
  });

  it('magasin silencieux au-delà de timeoutMs : LockUnavailableError', async () => {
    const store = fakeStore({ set: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const fn = vi.fn();

    const outcome = createLock(store, options)
      .withLock('k', fn)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(options.timeoutMs);

    expect(await outcome).toBeInstanceOf(LockUnavailableError);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('withLock : prise sans réponse (verrou orphelin)', () => {
  it('SET sans réponse dans timeoutMs : libère en tâche de fond avec le jeton tenté', async () => {
    const store = fakeStore({ set: vi.fn(never) });

    const outcome = createLock(store, options)
      .withLock('k', vi.fn())
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(options.timeoutMs);

    expect(await outcome).toBeInstanceOf(LockUnavailableError);
    const token = store.set.mock.calls[0]![1];
    expect(store.eval).toHaveBeenCalledTimes(1);
    const [script, numKeys, key, given] = store.eval.mock.calls[0]!;
    expect(script).toMatch(/get.*KEYS\[1\].*ARGV\[1\]/s);
    expect([numKeys, key, given]).toEqual([1, 'k', token]);
  });

  it('SET en erreur : libère aussi avec le jeton tenté', async () => {
    const store = fakeStore({ set: vi.fn().mockRejectedValue(new Error('ECONNRESET')) });

    await expect(createLock(store, options).withLock('k', vi.fn())).rejects.toBeInstanceOf(
      LockUnavailableError,
    );

    expect(store.eval).toHaveBeenCalledTimes(1);
    expect(store.eval.mock.calls[0]![3]).toBe(store.set.mock.calls[0]![1]);
  });

  it('la libération de fond ne bloque pas l’appelant', async () => {
    const store = fakeStore({
      set: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
      eval: vi.fn(never),
    });

    await expect(createLock(store, options).withLock('k', vi.fn())).rejects.toBeInstanceOf(
      LockUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(options.timeoutMs); // la libération expire : rien ne doit remonter
  });

  it('une libération de fond en échec ne produit aucune erreur non gérée', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const store = fakeStore({
        set: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
        eval: vi.fn().mockRejectedValue(new Error('valkey coupé')),
      });

      await expect(createLock(store, options).withLock('k', vi.fn())).rejects.toBeInstanceOf(
        LockUnavailableError,
      );
      await vi.advanceTimersByTimeAsync(options.timeoutMs);
      vi.useRealTimers();
      await new Promise((resolve) => setImmediate(resolve));

      expect(store.eval).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('prise refusée normalement (clé déjà prise) : aucune libération, la clé n’est pas à nous', async () => {
    const store = fakeStore({ set: vi.fn().mockResolvedValue(null) });

    await expect(
      createLock(store, { ...options, waitMs: 0 }).withLock('k', vi.fn()),
    ).rejects.toBeInstanceOf(LockBusyError);

    expect(store.eval).not.toHaveBeenCalled();
  });
});

describe('messages d’erreur sans identifiant', () => {
  const guildId = '123456789012345678';
  const targetId = '987654321098765432';
  const key = `moderation:lock:${guildId}:${targetId}`;

  it.each([
    ['LockBusyError', new LockBusyError(key)],
    ['LockUnavailableError', new LockUnavailableError(key)],
    ['LockNotOwnedError', new LockNotOwnedError(key)],
  ])('%s : message sans clé ni identifiant, la clé reste dans .key', (_name, error) => {
    expect(error.message).not.toContain(key);
    expect(error.message).not.toContain(guildId);
    expect(error.message).not.toContain(targetId);
    expect(error.key).toBe(key);
  });

  it('moderationLockKey : message fixe, sans l’identifiant refusé', () => {
    for (const bad of ['secret-1234', 'a:123456789012345678']) {
      expect(() => moderationLockKey(bad, guildId)).toThrow(
        expect.objectContaining({ message: 'Identifiant Discord invalide' }),
      );
      expect(() => moderationLockKey(guildId, bad)).toThrow(
        expect.objectContaining({ message: 'Identifiant Discord invalide' }),
      );
    }
  });
});

describe('moderationLockKey', () => {
  it('compose moderation:lock:<guildId>:<targetId>', () => {
    expect(moderationLockKey('123456789012345678', '98765432109876543')).toBe(
      'moderation:lock:123456789012345678:98765432109876543',
    );
  });

  it.each([
    ['vide', ''],
    ['lettres', 'abc123456789012345'],
    ['trop court (16 chiffres)', '1234567890123456'],
    ['trop long (21 chiffres)', '123456789012345678901'],
    ['séparateur injecté', '12345678901234567:1'],
    ['saut de ligne final', '123456789012345678\n'],
    ['préfixe injecté', 'a:123456789012345678'],
  ])('refuse un identifiant invalide : %s', (_label, bad) => {
    expect(() => moderationLockKey(bad, '123456789012345678')).toThrow(
      /Identifiant Discord invalide/,
    );
    expect(() => moderationLockKey('123456789012345678', bad)).toThrow(
      /Identifiant Discord invalide/,
    );
  });

  it('accepte 17 et 20 chiffres', () => {
    expect(() => moderationLockKey('1'.repeat(17), '9'.repeat(20))).not.toThrow(
      /Identifiant Discord invalide/,
    );
  });
});
