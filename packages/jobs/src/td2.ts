import { Queue, Worker, type Job } from 'bullmq';
import { DEFAULT_JOB_OPTIONS, redisConnection } from './common.js';

/** La file des sorties TD2 : le bot y ajoute les tâches et il est seul à les traiter. */
export const TD2_QUEUE = 'td2-reminders';

/** Le rappel part un quart d'heure avant le début. */
export const TD2_REMINDER_MS = 15 * 60_000;

export type Td2Job =
  { name: 'remind'; data: { eventId: number } } | { name: 'close'; data: { eventId: number } };

export type Td2JobName = Td2Job['name'];
export type Td2JobData = Td2Job['data'];

export const asTd2Job = (job: Pick<Job, 'name' | 'data'>): Td2Job =>
  ({ name: job.name, data: job.data }) as Td2Job;

/** Un rappel et une fermeture par sortie, au plus. */
export const td2JobId = {
  remind: (eventId: number) => `remind-${eventId}`,
  close: (eventId: number) => `close-${eventId}`,
};

export type Td2Queue = Queue<Td2JobData, void, Td2JobName>;
export type Td2Worker = Worker<Td2JobData, void, Td2JobName>;

export function createTd2Queue(url: string): Td2Queue {
  return new Queue<Td2JobData, void, Td2JobName>(TD2_QUEUE, {
    connection: redisConnection(url),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
}

/** Comme celui des giveaways : démarré par `run()` une fois le bot connecté, une tâche à la fois. */
export function createTd2Worker(url: string, processor: (job: Td2Job) => Promise<void>): Td2Worker {
  return new Worker<Td2JobData, void, Td2JobName>(TD2_QUEUE, (job) => processor(asTd2Job(job)), {
    connection: redisConnection(url),
    autorun: false,
    concurrency: 1,
  });
}

export interface Td2Scheduler {
  /** Planifie le rappel et la fermeture d'une sortie, en remplaçant ceux qu'elle avait. */
  schedule(eventId: number, scheduledAt: Date): Promise<void>;
  /**
   * Ajoute seulement les tâches qui manquent (reprise au démarrage) : une tâche déjà dans la file,
   * même échue pendant que le bot dormait, est gardée telle quelle.
   */
  ensure(eventId: number, scheduledAt: Date): Promise<void>;
  /** Retire le rappel et la fermeture d'une sortie annulée. */
  cancel(eventId: number): Promise<void>;
}

export function createTd2Scheduler(
  queue: Pick<Td2Queue, 'add' | 'remove'>,
  now: () => number = Date.now,
): Td2Scheduler {
  const cancel = async (eventId: number) => {
    await Promise.all([
      queue.remove(td2JobId.remind(eventId)),
      queue.remove(td2JobId.close(eventId)),
    ]);
  };

  const ensure = async (eventId: number, scheduledAt: Date) => {
    const untilStart = scheduledAt.getTime() - now();
    const untilReminder = untilStart - TD2_REMINDER_MS;
    // Moins d'un quart d'heure avant le début : pas de rappel, tout le monde vient de le voir
    if (untilReminder > 0) {
      await queue.add(
        'remind',
        { eventId },
        { jobId: td2JobId.remind(eventId), delay: untilReminder },
      );
    }
    await queue.add(
      'close',
      { eventId },
      { jobId: td2JobId.close(eventId), delay: Math.max(0, untilStart) },
    );
  };

  return {
    cancel,
    ensure,
    async schedule(eventId, scheduledAt) {
      // Une nouvelle date remplace l'ancienne : retirer puis ajouter, l'ID est libre
      await cancel(eventId);
      await ensure(eventId, scheduledAt);
    },
  };
}
