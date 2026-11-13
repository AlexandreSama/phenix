import { Queue, Worker, type Job } from 'bullmq';
import { redisConnection } from './common.js';

/** La file de modération : le bot la traite, BullMQ la planifie. */
export const MODERATION_QUEUE = 'moderation';

/** `purge` : le ménage des sanctions, une fois par nuit. */
export type ModerationJobName = 'purge';

export interface ModerationJob {
  name: ModerationJobName;
  /** L'heure prévue de la tâche, même si le worker la prend en retard */
  scheduledAt: Date;
}

export const asModerationJob = (job: Pick<Job, 'name' | 'timestamp' | 'delay'>): ModerationJob => ({
  name: job.name as ModerationJobName,
  scheduledAt: new Date(job.timestamp + (job.delay || 0)),
});

export type ModerationQueue = Queue<Record<string, never>, void, ModerationJobName>;
export type ModerationWorker = Worker<Record<string, never>, void, ModerationJobName>;

export function createModerationQueue(url: string): ModerationQueue {
  return new Queue<Record<string, never>, void, ModerationJobName>(MODERATION_QUEUE, {
    connection: redisConnection(url),
  });
}

/** Une tâche à la fois, démarré par `run()` comme les autres workers du bot. */
export function createModerationWorker(
  url: string,
  processor: (job: ModerationJob) => Promise<void>,
): ModerationWorker {
  return new Worker<Record<string, never>, void, ModerationJobName>(
    MODERATION_QUEUE,
    (job) => processor(asModerationJob(job)),
    { connection: redisConnection(url), autorun: false, concurrency: 1 },
  );
}

/**
 * Un ménage manqué se rattrape la nuit suivante : un seul essai, et rien ne reste dans Valkey.
 * Le planificateur de BullMQ ne crée qu'une tâche par créneau, même avec plusieurs instances.
 */
const TEMPLATE = { attempts: 1, removeOnComplete: true, removeOnFail: true } as const;

/** Crée (ou met à jour, au redémarrage) la tâche répétée. */
export async function ensureModerationSchedules(
  queue: Pick<ModerationQueue, 'upsertJobScheduler'>,
): Promise<void> {
  await queue.upsertJobScheduler(
    'purge',
    { pattern: '30 3 * * *', tz: 'Europe/Paris' },
    { name: 'purge', opts: TEMPLATE },
  );
}
