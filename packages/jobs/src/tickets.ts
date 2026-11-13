import { Queue, Worker, type Job } from 'bullmq';
import { redisConnection } from './common.js';

/** La file des tickets : le bot la traite, BullMQ la planifie. */
export const TICKET_QUEUE = 'tickets';

/** `inactivity` : rappel puis fermeture des tickets sans activité, toutes les 5 minutes. */
export type TicketJobName = 'inactivity';

export interface TicketJob {
  name: TicketJobName;
  /** L'heure prévue de la tâche, même si le worker la prend en retard */
  scheduledAt: Date;
}

export const asTicketJob = (job: Pick<Job, 'name' | 'timestamp' | 'delay'>): TicketJob => ({
  name: job.name as TicketJobName,
  scheduledAt: new Date(job.timestamp + (job.delay || 0)),
});

export type TicketQueue = Queue<Record<string, never>, void, TicketJobName>;
export type TicketWorker = Worker<Record<string, never>, void, TicketJobName>;

export function createTicketQueue(url: string): TicketQueue {
  return new Queue<Record<string, never>, void, TicketJobName>(TICKET_QUEUE, {
    connection: redisConnection(url),
  });
}

/** Une tâche à la fois, démarré par `run()` comme les autres workers du bot. */
export function createTicketWorker(
  url: string,
  processor: (job: TicketJob) => Promise<void>,
): TicketWorker {
  return new Worker<Record<string, never>, void, TicketJobName>(
    TICKET_QUEUE,
    (job) => processor(asTicketJob(job)),
    { connection: redisConnection(url), autorun: false, concurrency: 1 },
  );
}

/** Délai entre deux passages de la fermeture automatique. */
export const TICKET_INACTIVITY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Un passage manqué se rattrape au suivant, 5 minutes plus tard : un seul essai, et rien ne reste
 * dans Valkey. Le planificateur de BullMQ ne crée qu'une tâche par créneau, même avec plusieurs
 * instances.
 */
const TEMPLATE = { attempts: 1, removeOnComplete: true, removeOnFail: true } as const;

/** Crée (ou met à jour, au redémarrage) la tâche répétée. */
export async function ensureTicketSchedules(
  queue: Pick<TicketQueue, 'upsertJobScheduler'>,
): Promise<void> {
  await queue.upsertJobScheduler(
    'inactivity',
    { every: TICKET_INACTIVITY_INTERVAL_MS },
    { name: 'inactivity', opts: TEMPLATE },
  );
}
