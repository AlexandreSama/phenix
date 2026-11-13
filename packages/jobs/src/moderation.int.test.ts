import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createModerationQueue, ensureModerationSchedules } from './index.js';

const url = inject('redisUrl');
const queue = createModerationQueue(url);

beforeAll(async () => {
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  await queue.close();
});

describe('file de modération sur un vrai Valkey', () => {
  it('une seule planification de la purge, même après deux démarrages', async () => {
    await ensureModerationSchedules(queue);
    await ensureModerationSchedules(queue);

    expect(await queue.getJobSchedulersCount()).toBe(1);
    const scheduler = await queue.getJobScheduler('purge');
    expect(scheduler).toMatchObject({ name: 'purge', pattern: '30 3 * * *', tz: 'Europe/Paris' });
  });
});
