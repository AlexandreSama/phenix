import { describe, expect, it, vi } from 'vitest';
import { asMetricsJob, ensureMetricsSchedules } from './metrics.js';

describe('asMetricsJob', () => {
  it('rend l’heure prévue de la tâche, retard du worker compris', () => {
    expect(asMetricsJob({ name: 'sample', timestamp: 1_000, delay: 299_000 })).toEqual({
      name: 'sample',
      scheduledAt: new Date(300_000),
    });
    expect(asMetricsJob({ name: 'purge', timestamp: 5_000, delay: 0 }).scheduledAt).toEqual(
      new Date(5_000),
    );
  });
});

describe('ensureMetricsSchedules', () => {
  it('planifie le relevé toutes les 5 minutes et le ménage chaque nuit, sans nouvel essai', async () => {
    const queue = { upsertJobScheduler: vi.fn() };
    await ensureMetricsSchedules(queue as never, 300_000);

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'sample',
      { every: 300_000 },
      { name: 'sample', opts: expect.objectContaining({ attempts: 1 }) },
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'purge',
      { pattern: '0 3 * * *', tz: 'Europe/Paris' },
      expect.objectContaining({ name: 'purge' }),
    );
  });
});
