import { randomUUID } from 'node:crypto';

/**
 * Le strict nécessaire d'un client ioredis : le verrou ne dépend d'aucune instance, le bot et
 * l'API lui passent chacun la leur (et les tests, un faux magasin).
 */
export interface LockStore {
  /** `SET key value PX ttl NX` : « OK » si la clé a été posée, `null` si elle existe déjà. */
  set(key: string, value: string, px: 'PX', ttlMs: number, nx: 'NX'): Promise<'OK' | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

export interface LockOptions {
  /** Durée de vie du verrou : il s'efface seul si son propriétaire disparaît. */
  ttlMs: number;
  /**
   * Combien de temps attendre un verrou pris avant `LockBusyError` ; 0 = un seul essai. Les essais
   * s'arrêtent à `waitMs`, mais la prise entière (appel en cours compris) dure au plus
   * `max(waitMs, timeoutMs)`.
   */
  waitMs: number;
  /** Délai entre deux essais pendant l'attente. */
  retryMs: number;
  /** Au-delà, un magasin qui ne répond pas est tenu pour indisponible (par appel ; raccourci en fin d'attente). */
  timeoutMs: number;
  /**
   * Appelée quand la libération échoue ou n'a plus de propriétaire (TTL expiré : `LockNotOwnedError`).
   * Elle ne fait jamais échouer `withLock` : le résultat de `fn` prime.
   */
  onReleaseError?: (error: unknown, key: string) => void;
}

export interface Lock {
  /** Exécute `fn` en tenant le verrou `key`, puis le libère (même si `fn` lève). */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

/** Le verrou est tenu par un autre pendant toute l'attente : `fn` n'a pas été appelée. */
export class LockBusyError extends Error {
  constructor(readonly key: string) {
    super('Verrou déjà pris'); // pas de clé dans le message : elle contient l'identifiant du membre
    this.name = 'LockBusyError';
  }
}

/** Le magasin a échoué ou n'a pas répondu à temps : `fn` n'a pas été appelée. */
export class LockUnavailableError extends Error {
  constructor(
    readonly key: string,
    options?: ErrorOptions,
  ) {
    super('Verrou indisponible', options);
    this.name = 'LockUnavailableError';
  }
}

/** Libération sans propriétaire : le TTL a expiré, la clé n'était plus à nous. */
export class LockNotOwnedError extends Error {
  constructor(readonly key: string) {
    super('Verrou expiré avant sa libération');
    this.name = 'LockNotOwnedError';
  }
}

/** Supprime la clé seulement si elle porte encore notre jeton (jamais le verrou d'un autre). */
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

/** Plancher d'un essai de prise en fin d'attente : en dessous, on ne tente plus (voir `acquire`). */
const MIN_ATTEMPT_MS = 100;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Le verrou de modération : un par membre et par serveur, partagé par le bot et l'API. */
const SNOWFLAKE = /^\d{17,20}$/;
export function moderationLockKey(guildId: string, targetId: string): string {
  for (const id of [guildId, targetId]) {
    if (!SNOWFLAKE.test(id)) throw new Error('Identifiant Discord invalide');
  }
  return `moderation:lock:${guildId}:${targetId}`;
}

export function createLock(store: LockStore, options: LockOptions): Lock {
  const { ttlMs, waitMs, retryMs, timeoutMs, onReleaseError } = options;

  /**
   * Un appel au magasin, borné à `limitMs` ; toute défaillance devient `LockUnavailableError`.
   */
  const call = async <T>(
    key: string,
    operation: () => Promise<T>,
    limitMs: number = timeoutMs,
  ): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const silence = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Pas de réponse du magasin en ${limitMs} ms`)),
        limitMs,
      );
    });
    try {
      return await Promise.race([operation(), silence]);
    } catch (cause) {
      throw new LockUnavailableError(key, { cause });
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * Prend le verrou. Le temps TOTAL (essais, pauses et appel en cours compris) est borné par
   * `max(waitMs, timeoutMs)` : l'appelant (une interaction Discord a 3 s pour répondre) sait donc
   * quand il aura sa réponse. Pour cela chaque `SET` reçoit `min(timeoutMs, budget restant)`.
   * Les essais s'arrêtent à `waitMs` (`LockBusyError`) ; le premier essai a toujours `timeoutMs`
   * entier, même quand `waitMs` vaut 0.
   */
  const acquire = async (key: string): Promise<string> => {
    const start = Date.now();
    const waitDeadline = start + waitMs;
    const hardDeadline = start + Math.max(waitMs, timeoutMs);
    for (let attempt = 0; ; attempt++) {
      const remaining = hardDeadline - Date.now();
      // Un essai qui n'a que quelques ms ne prouverait rien (il échouerait à tort par « indisponible ») :
      // sous le plancher, on conclut « pris »
      if (attempt > 0 && remaining < Math.min(timeoutMs, MIN_ATTEMPT_MS)) {
        throw new LockBusyError(key);
      }
      const token = randomUUID();
      let reply: 'OK' | null;
      try {
        reply = await call(
          key,
          () => store.set(key, token, 'PX', ttlMs, 'NX'),
          Math.min(timeoutMs, remaining),
        );
      } catch (error) {
        // Le SET a pu partir quand même (file hors ligne d'ioredis) : sans cette libération, la clé
        // resterait posée avec un jeton que personne ne connaît jusqu'à la fin du TTL
        void call(key, () => store.eval(RELEASE_SCRIPT, 1, key, token)).catch(() => undefined);
        throw error;
      }
      if (reply === 'OK') return token;
      const left = waitDeadline - Date.now();
      if (left <= 0) throw new LockBusyError(key);
      await sleep(Math.min(retryMs, left));
    }
  };

  /** Signale sans jamais lever : un callback défaillant ne doit pas masquer le résultat de `fn`. */
  const report = (error: unknown, key: string): void => {
    try {
      onReleaseError?.(error, key);
    } catch {
      // Rien à faire : le résultat (ou l'erreur) de `fn` prime
    }
  };

  const release = async (key: string, token: string): Promise<void> => {
    try {
      const deleted = await call(key, () => store.eval(RELEASE_SCRIPT, 1, key, token));
      if (deleted !== 1) report(new LockNotOwnedError(key), key);
    } catch (error) {
      report(error, key);
    }
  };

  return {
    async withLock(key, fn) {
      const token = await acquire(key);
      try {
        return await fn();
      } finally {
        await release(key, token);
      }
    },
  };
}
