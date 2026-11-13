import { LockNotOwnedError, LockUnavailableError } from '@phenix/jobs';
import { describe, expect, it, vi } from 'vitest';
import { createLockReleaseLogger } from './lock-release-logger.js';

const KEY = 'moderation:lock:111111111111111111:222222222222222222';

describe('createLockReleaseLogger', () => {
  it('signale une libération sans propriétaire (TTL dépassé), sans la clé ni le membre', () => {
    const logger = { warn: vi.fn() };

    createLockReleaseLogger(logger)(new LockNotOwnedError(KEY), KEY);

    expect(logger.warn).toHaveBeenCalledWith(
      { reason: 'not-owned' },
      'Moderation lock released without owner (TTL exceeded)',
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('222222222222222222');
  });

  it('signale une libération impossible (Valkey), sans l’erreur qui contient la clé', () => {
    const logger = { warn: vi.fn() };

    createLockReleaseLogger(logger)(new LockUnavailableError(KEY), KEY);

    expect(logger.warn).toHaveBeenCalledWith(
      { reason: 'store-error' },
      'Moderation lock not released: it will expire on its own',
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('222222222222222222');
  });
});
