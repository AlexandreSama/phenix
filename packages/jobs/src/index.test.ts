import { describe, expect, it, vi } from 'vitest';
import { asGiveawayJob, createGiveawayScheduler, giveawayJobId } from './index.js';

/** Fausse file : retient ce qu'on lui demande. `existing` simule une tâche déjà présente. */
function fakeQueue(existing?: { delayed: boolean }) {
  const job = {
    isDelayed: vi.fn(async () => existing?.delayed ?? false),
    changeDelay: vi.fn(async (_delay: number) => {}),
    promote: vi.fn(async () => {}),
  };
  const queue = {
    add: vi.fn(async (_name: string, _data: object, _options?: object) => ({})),
    getJob: vi.fn(async (_id: string) => (existing ? job : undefined)),
    remove: vi.fn(async (_id: string) => 1),
  };
  return { queue, job };
}

const NOW = Date.parse('2026-11-09T12:00:00Z');
const scheduler = (queue: ReturnType<typeof fakeQueue>['queue']) =>
  createGiveawayScheduler(queue as never, () => NOW);

describe('createGiveawayScheduler', () => {
  it('planifie le tirage à la date de fin, sous un ID propre au giveaway', async () => {
    const { queue } = fakeQueue();

    await scheduler(queue).scheduleEnd(7, new Date('2026-11-09T13:00:00Z'));

    expect(queue.add).toHaveBeenCalledWith(
      'end',
      { giveawayId: 7 },
      { jobId: 'end-7', delay: 3_600_000 },
    );
  });

  it('déplace un tirage déjà planifié au lieu d’en ajouter un second', async () => {
    const { queue, job } = fakeQueue({ delayed: true });

    await scheduler(queue).scheduleEnd(7, new Date('2026-11-09T12:30:00Z'));

    expect(job.changeDelay).toHaveBeenCalledWith(1_800_000);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('avance un tirage planifié, ou l’ajoute tout de suite s’il manque', async () => {
    const planned = fakeQueue({ delayed: true });
    await scheduler(planned.queue).endNow(7);
    expect(planned.job.promote).toHaveBeenCalled();

    const missing = fakeQueue();
    await scheduler(missing.queue).endNow(7);
    expect(missing.queue.add).toHaveBeenCalledWith('end', { giveawayId: 7 }, { jobId: 'end-7' });
  });

  it('ne planifie jamais dans le passé', async () => {
    const { queue } = fakeQueue();

    await scheduler(queue).scheduleEnd(7, new Date('2026-11-09T11:00:00Z'));

    expect(queue.add).toHaveBeenCalledWith('end', { giveawayId: 7 }, { jobId: 'end-7', delay: 0 });
  });

  it('regroupe les mises à jour du message sous un même ID', async () => {
    const { queue } = fakeQueue();

    await scheduler(queue).publish(7, { delayMs: 5000 });

    expect(queue.add).toHaveBeenCalledWith(
      'publish',
      { giveawayId: 7 },
      { jobId: giveawayJobId.publish(7), delay: 5000 },
    );
  });

  it('annule les tâches en attente d’un giveaway supprimé', async () => {
    const { queue } = fakeQueue();

    await scheduler(queue).cancel(7);

    expect(queue.remove).toHaveBeenCalledWith('end-7');
    expect(queue.remove).toHaveBeenCalledWith('publish-7');
  });
});

describe('asGiveawayJob', () => {
  it('garde le nom et les données de la tâche', () => {
    expect(asGiveawayJob({ name: 'end', data: { giveawayId: 3 } })).toEqual({
      name: 'end',
      data: { giveawayId: 3 },
    });
  });
});
