import { LockNotOwnedError } from '@phenix/jobs';
import type { Logger } from 'pino';

/**
 * Le `onReleaseError` des verrous de modération. Ni la clé ni l'erreur au log : elles contiennent
 * l'identifiant du membre. Une libération sans propriétaire veut dire que l'action a duré plus que
 * le TTL : une autre a pu prendre le verrou pendant qu'elle finissait.
 */
export function createLockReleaseLogger(logger: Pick<Logger, 'warn'>) {
  return (error: unknown, _key: string): void => {
    if (error instanceof LockNotOwnedError) {
      logger.warn({ reason: 'not-owned' }, 'Moderation lock released without owner (TTL exceeded)');
      return;
    }
    logger.warn(
      { reason: 'store-error' },
      'Moderation lock not released: it will expire on its own',
    );
  };
}
