import type { Logger } from '../../logger.js';
import { createGuildRateLimiter } from './join-limiter.js';
import { errorFields } from './log-fields.js';

export interface RoleQueue {
  /** Ajoute une tâche ; faux si le plafond du serveur est atteint (tâche abandonnée). */
  enqueue(guildId: string, task: () => Promise<void>): boolean;
  /** Se résout quand la file est vide et qu'aucune tâche ne tourne (pour les tests). */
  idle(): Promise<void>;
}

export interface RoleQueueOptions {
  concurrency?: number;
  perGuildPerMinute?: number;
  now?: () => number;
  logger: Pick<Logger, 'warn' | 'error'>;
}

/**
 * File des rôles d'arrivée : peu d'appels à Discord en même temps, et un plafond par serveur
 * et par minute. Pendant un raid, le bot ne s'épuise pas en ajouts de rôle.
 */
export function createRoleQueue({
  concurrency = 2,
  perGuildPerMinute = 60,
  now = Date.now,
  logger,
}: RoleQueueOptions): RoleQueue {
  const limiter = createGuildRateLimiter({ max: perGuildPerMinute, windowMs: 60_000, now });
  const pending: { guildId: string; task: () => Promise<void> }[] = [];
  let running = 0;
  let waiters: (() => void)[] = [];

  function settle(): void {
    if (running > 0 || pending.length > 0) return;
    for (const resolve of waiters) resolve();
    waiters = [];
  }

  function pump(): void {
    while (running < concurrency && pending.length > 0) {
      const { guildId, task } = pending.shift()!;
      running += 1;
      // Lancée tout de suite ; une exception synchrone devient un rejet
      void new Promise<void>((resolve) => resolve(task()))
        .catch((err: unknown) =>
          logger.error({ guildId, ...errorFields(err) }, 'Welcome role task failed'),
        )
        .finally(() => {
          running -= 1;
          pump();
          settle();
        });
    }
  }

  return {
    enqueue(guildId, task) {
      const { allowed, warn } = limiter.take(guildId);
      if (!allowed) {
        if (warn) {
          logger.warn(
            { guildId, limit: perGuildPerMinute },
            'Welcome role cap reached for this guild: further grants are skipped for a minute',
          );
        }
        return false;
      }
      pending.push({ guildId, task });
      pump();
      return true;
    },
    idle() {
      return new Promise((resolve) => {
        waiters.push(resolve);
        settle();
      });
    },
  };
}
