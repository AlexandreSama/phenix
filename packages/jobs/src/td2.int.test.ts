import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  createTd2Queue,
  createTd2Scheduler,
  createTd2Worker,
  TD2_REMINDER_MS,
  type Td2Job,
  type Td2Worker,
} from './index.js';

const url = inject('redisUrl');
const queue = createTd2Queue(url);
const processed: (Td2Job & { at: number })[] = [];
let worker: Td2Worker;

beforeAll(async () => {
  await queue.obliterate({ force: true });
  worker = createTd2Worker(url, async (job) => {
    processed.push({ ...job, at: Date.now() });
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const of = (name: Td2Job['name'], eventId: number) =>
  processed.filter((job) => job.name === name && job.data.eventId === eventId);

describe('file des sorties TD2 sur un vrai Valkey', () => {
  it('rappelle un quart d’heure avant le début', async () => {
    // Horloge décalée : la sortie « commence » dans 15 min + 300 ms
    const start = Date.now();
    const scheduler = createTd2Scheduler(queue, () => Date.now());
    await scheduler.schedule(1, new Date(start + TD2_REMINDER_MS + 300));
    await sleep(100);
    expect(of('remind', 1)).toHaveLength(0);

    await sleep(500);
    expect(of('remind', 1)).toHaveLength(1);
    expect(of('remind', 1)[0]!.at - start).toBeGreaterThanOrEqual(250);
  });

  it('une sortie déplacée ne garde que les nouvelles tâches', async () => {
    const scheduler = createTd2Scheduler(queue);
    await scheduler.schedule(2, new Date(Date.now() + 200));
    await scheduler.schedule(2, new Date(Date.now() + 3_600_000));

    await sleep(500);
    expect(of('close', 2)).toHaveLength(0);
  });

  it('une sortie annulée ne ferme jamais', async () => {
    const scheduler = createTd2Scheduler(queue);
    await scheduler.schedule(3, new Date(Date.now() + 200));
    await scheduler.cancel(3);

    await sleep(500);
    expect(of('close', 3)).toHaveLength(0);
  });

  it('la reprise garde un rappel échu pendant que le bot dormait', async () => {
    const scheduler = createTd2Scheduler(queue);
    // Le worker est arrêté : le rappel arrive à échéance sans être traité
    await worker.pause();
    await scheduler.schedule(5, new Date(Date.now() + TD2_REMINDER_MS + 100));
    await sleep(300);

    // Au redémarrage, la reprise passe avant que le worker ne reparte
    await scheduler.ensure(5, new Date(Date.now() + TD2_REMINDER_MS - 200));
    worker.resume();

    await sleep(500);
    expect(of('remind', 5)).toHaveLength(1);
  });

  it('ferme une sortie dont l’heure est passée dès qu’elle est planifiée', async () => {
    await createTd2Scheduler(queue).schedule(4, new Date(Date.now() - 1000));

    await sleep(300);
    expect(of('close', 4)).toHaveLength(1);
    expect(of('remind', 4)).toHaveLength(0);
  });
});
