import { describe, expect, it, vi } from 'vitest';
import { createTd2Scheduler, TD2_REMINDER_MS } from './td2.js';

const NOW = Date.parse('2026-11-09T12:00:00Z');

function fakeQueue() {
  return {
    add: vi.fn(async (_name: string, _data: object, _options?: object) => ({})),
    remove: vi.fn(async (_id: string) => 1),
  };
}

describe('createTd2Scheduler', () => {
  it('planifie le rappel un quart d’heure avant, et la fermeture à l’heure', async () => {
    const queue = fakeQueue();

    await createTd2Scheduler(queue as never, () => NOW).schedule(
      7,
      new Date('2026-11-09T14:00:00Z'),
    );

    expect(queue.add.mock.calls).toEqual([
      ['remind', { eventId: 7 }, { jobId: 'remind-7', delay: 2 * 3_600_000 - TD2_REMINDER_MS }],
      ['close', { eventId: 7 }, { jobId: 'close-7', delay: 2 * 3_600_000 }],
    ]);
  });

  it('remplace les tâches d’une sortie déplacée', async () => {
    const queue = fakeQueue();

    await createTd2Scheduler(queue as never, () => NOW).schedule(
      7,
      new Date('2026-11-09T14:00:00Z'),
    );

    // Retirées avant d'être ajoutées : l'ID est libre pour la nouvelle date
    expect(queue.remove.mock.calls).toEqual([['remind-7'], ['close-7']]);
    expect(queue.remove.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('pas de rappel à moins d’un quart d’heure du début', async () => {
    const queue = fakeQueue();

    await createTd2Scheduler(queue as never, () => NOW).schedule(
      7,
      new Date('2026-11-09T12:10:00Z'),
    );

    expect(queue.add.mock.calls).toEqual([
      ['close', { eventId: 7 }, { jobId: 'close-7', delay: 600_000 }],
    ]);
  });

  it('à la reprise, n’ajoute que ce qui manque, sans rien retirer', async () => {
    const queue = fakeQueue();

    await createTd2Scheduler(queue as never, () => NOW).ensure(7, new Date('2026-11-09T14:00:00Z'));

    expect(queue.remove).not.toHaveBeenCalled();
    expect(queue.add.mock.calls.map(([name, , options]) => [name, options])).toEqual([
      ['remind', { jobId: 'remind-7', delay: 2 * 3_600_000 - TD2_REMINDER_MS }],
      ['close', { jobId: 'close-7', delay: 2 * 3_600_000 }],
    ]);
  });

  it('annule le rappel et la fermeture', async () => {
    const queue = fakeQueue();

    await createTd2Scheduler(queue as never, () => NOW).cancel(7);

    expect(queue.remove.mock.calls).toEqual([['remind-7'], ['close-7']]);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
