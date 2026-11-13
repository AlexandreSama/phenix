import { Queue, Worker, type Job } from 'bullmq';
import { DEFAULT_JOB_OPTIONS, redisConnection } from './common.js';
export * from './lock.js';
export * from './metrics.js';
export * from './moderation.js';
export * from './td2.js';
export * from './tickets.js';

/** Le nom de la file : le bot (qui traite) et l'API (qui ajoute) doivent dire le même. */
export const GIVEAWAY_QUEUE = 'giveaways';

/** Les tâches de la file, et ce que chacune transporte. */
export type GiveawayJob =
  | { name: 'publish'; data: { giveawayId: number } }
  | { name: 'end'; data: { giveawayId: number } }
  | { name: 'reroll'; data: { giveawayId: number } }
  | { name: 'remove'; data: { channelId: string; messageId: string } };

export type GiveawayJobName = GiveawayJob['name'];
export type GiveawayJobData = GiveawayJob['data'];

/** Relit une tâche reçue par le worker avec son type précis : `data` suit `name`. */
export const asGiveawayJob = (job: Pick<Job, 'name' | 'data'>): GiveawayJob =>
  ({ name: job.name, data: job.data }) as GiveawayJob;

/** Les clics arrivés pendant ce délai ne font qu'une seule mise à jour du message. */
export const REFRESH_DELAY_MS = 5000;

/**
 * Un ID par giveaway et par sorte de tâche : BullMQ refuse d'ajouter une tâche dont l'ID
 * existe déjà. (Les « : » sont interdits dans un ID, d'où les tirets.)
 */
export const giveawayJobId = {
  publish: (giveawayId: number) => `publish-${giveawayId}`,
  end: (giveawayId: number) => `end-${giveawayId}`,
  reroll: (giveawayId: number) => `reroll-${giveawayId}`,
};

export type GiveawayQueue = Queue<GiveawayJobData, void, GiveawayJobName>;

export function createGiveawayQueue(url: string): GiveawayQueue {
  return new Queue<GiveawayJobData, void, GiveawayJobName>(GIVEAWAY_QUEUE, {
    connection: redisConnection(url),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
}

export type GiveawayWorker = Worker<GiveawayJobData, void, GiveawayJobName>;

/**
 * Le worker du bot. Il ne démarre qu'à l'appel de `run()`, une fois le bot connecté à Discord.
 * Une tâche à la fois : la mise à jour d'un message ne peut pas passer après son tirage.
 */
export function createGiveawayWorker(
  url: string,
  processor: (job: GiveawayJob) => Promise<void>,
): GiveawayWorker {
  return new Worker<GiveawayJobData, void, GiveawayJobName>(
    GIVEAWAY_QUEUE,
    (job) => processor(asGiveawayJob(job)),
    { connection: redisConnection(url), autorun: false, concurrency: 1 },
  );
}

/** Ce que le bot et l'API demandent à la file, sans manipuler BullMQ eux-mêmes. */
export interface GiveawayScheduler {
  /** Poste ou met à jour le message ; avec `delayMs`, regroupe les demandes rapprochées. */
  publish(giveawayId: number, options?: { delayMs?: number }): Promise<void>;
  /** Planifie le tirage à la date de fin, ou déplace celui qui est déjà planifié. */
  scheduleEnd(giveawayId: number, endsAt: Date): Promise<void>;
  /** Avance le tirage à maintenant. */
  endNow(giveawayId: number): Promise<void>;
  reroll(giveawayId: number): Promise<void>;
  /** Retire le message d'un giveaway supprimé. */
  removeMessage(message: { channelId: string; messageId: string }): Promise<void>;
  /** Annule les tâches en attente d'un giveaway supprimé. */
  cancel(giveawayId: number): Promise<void>;
}

type QueueLike = Pick<GiveawayQueue, 'add' | 'getJob' | 'remove'>;

export function createGiveawayScheduler(
  queue: QueueLike,
  now: () => number = Date.now,
): GiveawayScheduler {
  /** Une tâche planifiée est « delayed » : seule celle-là se déplace ou s'avance. */
  const delayedJob = async (jobId: string) => {
    const job = await queue.getJob(jobId);
    return job && (await job.isDelayed()) ? job : undefined;
  };

  return {
    async publish(giveawayId, { delayMs = 0 } = {}) {
      await queue.add(
        'publish',
        { giveawayId },
        { jobId: giveawayJobId.publish(giveawayId), delay: delayMs },
      );
    },

    async scheduleEnd(giveawayId, endsAt) {
      const delay = Math.max(0, endsAt.getTime() - now());
      const jobId = giveawayJobId.end(giveawayId);
      const planned = await delayedJob(jobId);
      if (planned) {
        await planned.changeDelay(delay);
        return;
      }
      // Déjà en cours ou en file : add ne fait rien, l'ID existe
      await queue.add('end', { giveawayId }, { jobId, delay });
    },

    async endNow(giveawayId) {
      const jobId = giveawayJobId.end(giveawayId);
      const planned = await delayedJob(jobId);
      if (planned) {
        await planned.promote();
        return;
      }
      await queue.add('end', { giveawayId }, { jobId });
    },

    async reroll(giveawayId) {
      // Un double clic sur le site ne relance pas deux fois : même ID tant que la première attend
      await queue.add('reroll', { giveawayId }, { jobId: giveawayJobId.reroll(giveawayId) });
    },

    async removeMessage(message) {
      await queue.add('remove', message);
    },

    async cancel(giveawayId) {
      await Promise.all([
        queue.remove(giveawayJobId.end(giveawayId)),
        queue.remove(giveawayJobId.publish(giveawayId)),
      ]);
    },
  };
}
