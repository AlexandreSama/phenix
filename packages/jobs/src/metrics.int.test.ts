import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  createMetricsQueue,
  createMetricsWorker,
  ensureMetricsSchedules,
  type MetricsJob,
  type MetricsWorker,
} from './index.js';

const url = inject('redisUrl');
const queue = createMetricsQueue(url);
const processed: MetricsJob[] = [];
let workers: MetricsWorker[] = [];

beforeAll(async () => {
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  await queue.close();
});

describe('file des métriques sur un vrai Valkey', () => {
  it('une seule tâche par créneau, même avec deux bots et deux démarrages', async () => {
    // Deux instances qui démarrent chacune les planifications : une seule paire en résulte
    await ensureMetricsSchedules(queue, 500);
    await ensureMetricsSchedules(queue, 500);
    expect(await queue.getJobSchedulersCount()).toBe(2);

    workers = [0, 1].map(() =>
      createMetricsWorker(url, async (job) => {
        processed.push(job);
      }),
    );
    for (const worker of workers) {
      worker.run().catch((err: unknown) => {
        throw err;
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 2200));

    const samples = processed.filter((job) => job.name === 'sample');
    expect(samples.length).toBeGreaterThanOrEqual(3);
    // Chaque créneau n'a été traité qu'une fois, par l'un ou l'autre worker
    const slots = samples.map((job) => job.scheduledAt.getTime());
    expect(new Set(slots).size).toBe(slots.length);
    expect(processed.some((job) => job.name === 'purge')).toBe(false);
  });
});
