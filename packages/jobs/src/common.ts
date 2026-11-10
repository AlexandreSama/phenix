import type { ConnectionOptions, JobsOptions } from 'bullmq';

/**
 * Cinq essais espacés de 5 s, 10 s, 20 s, 40 s : Discord a le temps de revenir.
 * Une tâche finie (réussie ou abandonnée) ne reste pas dans Valkey : la base garde l'état.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: true,
};

/** maxRetriesPerRequest: null : exigé par les workers, qui attendent les tâches sans limite. */
export const redisConnection = (url: string): ConnectionOptions => ({
  url,
  maxRetriesPerRequest: null,
});
