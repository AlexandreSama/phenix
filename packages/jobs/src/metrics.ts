import { Queue, Worker, type Job } from 'bullmq';
import { redisConnection } from './common.js';

/** La file des métriques (phase 11) : le bot la traite, BullMQ la planifie. */
export const METRICS_QUEUE = 'metrics';

/** `sample` : un relevé toutes les 5 minutes ; `purge` : le ménage, une fois par jour. */
export type MetricsJobName = 'sample' | 'purge';

export interface MetricsJob {
  name: MetricsJobName;
  /** L'heure prévue de la tâche, même si le worker la prend en retard */
  scheduledAt: Date;
}

export const asMetricsJob = (job: Pick<Job, 'name' | 'timestamp' | 'delay'>): MetricsJob => ({
  name: job.name as MetricsJobName,
  scheduledAt: new Date(job.timestamp + (job.delay || 0)),
});

export type MetricsQueue = Queue<Record<string, never>, void, MetricsJobName>;
export type MetricsWorker = Worker<Record<string, never>, void, MetricsJobName>;

export function createMetricsQueue(url: string): MetricsQueue {
  return new Queue<Record<string, never>, void, MetricsJobName>(METRICS_QUEUE, {
    connection: redisConnection(url),
  });
}

/** Une tâche à la fois, démarré par `run()` comme les autres workers du bot. */
export function createMetricsWorker(
  url: string,
  processor: (job: MetricsJob) => Promise<void>,
): MetricsWorker {
  return new Worker<Record<string, never>, void, MetricsJobName>(
    METRICS_QUEUE,
    (job) => processor(asMetricsJob(job)),
    { connection: redisConnection(url), autorun: false, concurrency: 1 },
  );
}

/**
 * Un relevé manqué ne se rattrape pas : un seul essai, et rien ne reste dans Valkey.
 * Le planificateur de BullMQ ne crée qu'une tâche par créneau, même avec plusieurs instances.
 */
const TEMPLATE = { attempts: 1, removeOnComplete: true, removeOnFail: true } as const;

/** Crée (ou met à jour, au redémarrage) les deux tâches répétées. */
export async function ensureMetricsSchedules(
  queue: Pick<MetricsQueue, 'upsertJobScheduler'>,
  sampleEveryMs: number,
): Promise<void> {
  await queue.upsertJobScheduler(
    'sample',
    { every: sampleEveryMs },
    { name: 'sample', opts: TEMPLATE },
  );
  await queue.upsertJobScheduler(
    'purge',
    { pattern: '0 3 * * *', tz: 'Europe/Paris' },
    { name: 'purge', opts: TEMPLATE },
  );
}
