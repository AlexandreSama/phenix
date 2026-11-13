import { describe, expect, it, vi } from 'vitest';
import { asTicketJob, ensureTicketSchedules, TICKET_QUEUE } from './tickets.js';

describe('TICKET_QUEUE', () => {
  it('se nomme « tickets », comme les autres files', () => {
    expect(TICKET_QUEUE).toBe('tickets');
  });
});

describe('asTicketJob', () => {
  it('rend l’heure prévue de la tâche, retard du worker compris', () => {
    expect(asTicketJob({ name: 'inactivity', timestamp: 1_000, delay: 299_000 })).toEqual({
      name: 'inactivity',
      scheduledAt: new Date(300_000),
    });
    expect(asTicketJob({ name: 'inactivity', timestamp: 5_000, delay: 0 }).scheduledAt).toEqual(
      new Date(5_000),
    );
  });

  it('garde le nom reçu : le worker ignore ce qu’il ne connaît pas', () => {
    expect(asTicketJob({ name: 'autre', timestamp: 0, delay: 0 }).name).toBe('autre');
  });
});

describe('ensureTicketSchedules', () => {
  it('planifie la fermeture automatique toutes les 5 minutes, sans nouvel essai', async () => {
    const queue = { upsertJobScheduler: vi.fn() };
    await ensureTicketSchedules(queue as never);

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'inactivity',
      { every: 300_000 },
      { name: 'inactivity', opts: { attempts: 1, removeOnComplete: true, removeOnFail: true } },
    );
  });
});
