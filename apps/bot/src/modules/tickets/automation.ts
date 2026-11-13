import { createTicketQueue, createTicketWorker, ensureTicketSchedules } from '@phenix/jobs';
import { Events, type Client } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { createActivityHandler } from './activity.js';
import { errorCode } from './error-code.js';
import { createTicketProcessor } from './inactivity.js';

export interface TicketAutomationInput {
  client: Pick<Client, 'on' | 'channels' | 'users'>;
  /** Le contexte complet : le processeur ferme avec transcript */
  context: BotContext;
  redisUrl: string;
}

export interface TicketAutomation {
  /** À l'événement « prêt » de Discord : planifie le passage et démarre le worker */
  start(): void;
  /** À l'arrêt : laisse finir le passage en cours, puis ferme la file */
  stop(): Promise<void>;
}

/**
 * Le câblage de la fermeture automatique dans `index.ts` : suivi d'activité sur MessageCreate
 * (le contenu n'est jamais lu), file et worker `tickets`, passage planifié toutes les 5 minutes.
 */
export function registerTicketAutomation({
  client,
  context,
  redisUrl,
}: TicketAutomationInput): TicketAutomation {
  const { logger } = context;
  client.on(Events.MessageCreate, createActivityHandler(context));

  const queue = createTicketQueue(redisUrl);
  const worker = createTicketWorker(redisUrl, createTicketProcessor({ client, context }));
  // Sans écouteur « error », une coupure de Valkey ferait planter le processus
  queue.on('error', (err) => logger.error({ err }, 'Ticket queue: Valkey error'));
  worker.on('error', (err) => logger.error({ err }, 'Ticket worker error'));
  worker.on('failed', (job, err) =>
    logger.warn({ job: job?.name, code: errorCode(err) }, 'Ticket inactivity pass failed'),
  );

  return {
    start() {
      ensureTicketSchedules(queue).catch((err: unknown) =>
        logger.error({ code: errorCode(err) }, 'Failed to schedule the ticket inactivity pass'),
      );
      worker
        .run()
        .catch((err: unknown) => logger.error({ code: errorCode(err) }, 'Ticket worker stopped'));
    },
    async stop() {
      await worker.close();
      await queue.close();
    },
  };
}
