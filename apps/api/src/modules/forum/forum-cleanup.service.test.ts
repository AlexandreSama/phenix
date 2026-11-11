import type { PrismaClient } from '@phenix/database';
import { describe, expect, it, vi } from 'vitest';
import { ForumCleanupService, ORPHAN_GRACE_MS } from './forum-cleanup.service.js';

const NOW = new Date('2026-11-10T12:00:00Z');

function setup(stillOrphan: (id: string) => boolean) {
  const db = {
    forumAttachment: {
      findMany: vi.fn(async () => [
        { id: 'a', key: 'forum/a.webp' },
        { id: 'b', key: 'forum/b.webp' },
      ]),
      deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => ({
        count: stillOrphan(where.id) ? 1 : 0,
      })),
    },
  };
  const media = {
    put: vi.fn(),
    getText: vi.fn(),
    getBytes: vi.fn(),
    delete: vi.fn(async () => {}),
  };
  const service = new ForumCleanupService(db as unknown as PrismaClient, media);
  return { db, media, service };
}

describe('ForumCleanupService', () => {
  it('supprime les orphelines de plus d’un jour, ligne puis fichier', async () => {
    const { db, media, service } = setup(() => true);

    expect(await service.sweep(NOW)).toBe(2);
    expect(db.forumAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: null, createdAt: { lt: new Date(NOW.getTime() - ORPHAN_GRACE_MS) } },
      }),
    );
    expect(media.delete).toHaveBeenCalledWith(['forum/a.webp']);
    expect(media.delete).toHaveBeenCalledWith(['forum/b.webp']);
  });

  it('une image citée entre-temps garde son fichier', async () => {
    const { media, service } = setup((id) => id === 'a');

    expect(await service.sweep(NOW)).toBe(1);
    expect(media.delete).not.toHaveBeenCalledWith(['forum/b.webp']);
  });
});
