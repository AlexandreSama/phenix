import { Injectable, Logger } from '@nestjs/common';
import { createLock, LockNotOwnedError, type Lock } from '@phenix/jobs';
import { Redis } from 'ioredis';

/**
 * Le verrou partagé avec le bot (Valkey), par exemple `moderationLockKey` : une seule action de
 * modération à la fois sur un même membre, qu'elle vienne du site ou d'une commande.
 * TTL de 30 s : il couvre les appels Discord d'une levée, et s'efface seul si l'API tombe.
 */
@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);
  private readonly lock: Lock;

  constructor(redis: Redis) {
    this.lock = createLock(redis, {
      ttlMs: 30_000,
      waitMs: 2_000,
      retryMs: 100,
      timeoutMs: 1_000,
      // Jamais la clé ni le message : ils contiennent l'identifiant du membre
      onReleaseError: (error) => {
        if (error instanceof LockNotOwnedError) {
          this.logger.warn('Lock released without owner (TTL exceeded)');
          return;
        }
        this.logger.warn(
          { error: error instanceof Error ? error.name : 'unknown' },
          'Lock release failed',
        );
      },
    });
  }

  /** Exécute `fn` en tenant le verrou `key` ; `LockBusyError` ou `LockUnavailableError` sinon. */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.lock.withLock(key, fn);
  }
}
