import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  createGiveawayQueue,
  createGiveawayScheduler,
  createGiveawayWorker,
  type GiveawayJobData,
  type GiveawayWorker,
} from './index.js';

const url = inject('redisUrl');
const queue = createGiveawayQueue(url);
const scheduler = createGiveawayScheduler(queue);
const processed: { name: string; data: GiveawayJobData; at: number }[] = [];
let worker: GiveawayWorker;

beforeAll(async () => {
  await queue.obliterate({ force: true });
  worker = createGiveawayWorker(url, async (job) => {
    processed.push({ name: job.name, data: job.data, at: Date.now() });
  });
  worker.run().catch((err: unknown) => {
    throw err;
  });
  await worker.waitUntilReady();
});

afterAll(async () => {
  await worker.close();
  await queue.close();
});

const waitFor = async (check: () => boolean, timeoutMs = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('Tâche jamais traitée');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

const ofGiveaway = (name: string, giveawayId: number) =>
  processed.filter(
    (entry) =>
      entry.name === name && 'giveawayId' in entry.data && entry.data.giveawayId === giveawayId,
  );

describe('file des giveaways sur un vrai Valkey', () => {
  it('lance le tirage à la date prévue, et une seule fois même planifié deux fois', async () => {
    const start = Date.now();
    await scheduler.scheduleEnd(1, new Date(start + 600));
    await scheduler.scheduleEnd(1, new Date(start + 600));

    await waitFor(() => ofGiveaway('end', 1).length > 0);
    expect(ofGiveaway('end', 1)[0]!.at - start).toBeGreaterThanOrEqual(500);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(ofGiveaway('end', 1)).toHaveLength(1);
  });

  it('« Terminer » avance un tirage prévu dans une heure', async () => {
    await scheduler.scheduleEnd(2, new Date(Date.now() + 3_600_000));
    await scheduler.endNow(2);

    await waitFor(() => ofGiveaway('end', 2).length > 0, 2000);
    expect(ofGiveaway('end', 2)).toHaveLength(1);
  });

  it('déplace un tirage déjà planifié', async () => {
    await scheduler.scheduleEnd(3, new Date(Date.now() + 3_600_000));
    await scheduler.scheduleEnd(3, new Date(Date.now() + 200));

    await waitFor(() => ofGiveaway('end', 3).length > 0, 2000);
    expect(ofGiveaway('end', 3)).toHaveLength(1);
  });

  it('regroupe dix demandes de mise à jour en une seule', async () => {
    for (let i = 0; i < 10; i++) await scheduler.publish(4, { delayMs: 300 });

    await waitFor(() => ofGiveaway('publish', 4).length > 0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(ofGiveaway('publish', 4)).toHaveLength(1);
  });

  it('annule le tirage d’un giveaway supprimé', async () => {
    await scheduler.scheduleEnd(5, new Date(Date.now() + 300));
    await scheduler.cancel(5);

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(ofGiveaway('end', 5)).toHaveLength(0);
  });
});
