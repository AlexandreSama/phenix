import { describe, expect, it, vi } from 'vitest';
import { asModerationJob, ensureModerationSchedules } from './moderation.js';

describe('asModerationJob', () => {
  it('rend l’heure prévue de la tâche, retard du worker compris', () => {
    expect(asModerationJob({ name: 'purge', timestamp: 1_000, delay: 299_000 })).toEqual({
      name: 'purge',
      scheduledAt: new Date(300_000),
    });
    expect(asModerationJob({ name: 'purge', timestamp: 5_000, delay: 0 }).scheduledAt).toEqual(
      new Date(5_000),
    );
  });
});

describe('ensureModerationSchedules', () => {
  it('planifie la purge chaque nuit à 3 h 30 (Paris), sans nouvel essai', async () => {
    const queue = { upsertJobScheduler: vi.fn() };
    await ensureModerationSchedules(queue as never);

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'purge',
      { pattern: '30 3 * * *', tz: 'Europe/Paris' },
      { name: 'purge', opts: { attempts: 1, removeOnComplete: true, removeOnFail: true } },
    );
  });
});
