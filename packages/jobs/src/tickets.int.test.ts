import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createTicketQueue, ensureTicketSchedules } from './index.js';

const url = inject('redisUrl');
const queue = createTicketQueue(url);

beforeAll(async () => {
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  await queue.close();
});

describe('file des tickets sur un vrai Valkey', () => {
  it('une seule planification de la fermeture automatique, même après deux démarrages', async () => {
    await ensureTicketSchedules(queue);
    await ensureTicketSchedules(queue);

    expect(await queue.getJobSchedulersCount()).toBe(1);
    const scheduler = await queue.getJobScheduler('inactivity');
    expect(scheduler).toMatchObject({ name: 'inactivity', every: 300_000 });
  });
});
