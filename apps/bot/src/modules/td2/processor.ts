import { findTd2Event, type PrismaClient } from '@phenix/database';
import { TD2_REMINDER_MS, type Td2Job } from '@phenix/jobs';
import type { Client } from 'discord.js';
import { isLastingPublishError } from '../../core/publish.js';
import type { Logger } from '../../logger.js';
import { reminderMessage } from './messages.js';
import { sendTd2Notice, syncTd2Message } from './sync.js';

/**
 * Marge pour reconnaître une tâche périmée : la sortie a été déplacée plus tard, et sa nouvelle
 * date a ses propres tâches. Normalement la tâche périmée a été retirée ; ceci est le filet.
 */
export const STALE_MARGIN_MS = 60_000;

export interface Td2ProcessorDeps {
  client: Client;
  db: Pick<PrismaClient, 'td2Event'>;
  logger: Pick<Logger, 'info' | 'warn'>;
  now?: () => Date;
}

/** Ce que fait le worker du bot pour chaque tâche de la file des sorties. */
export function createTd2Processor({
  client,
  db,
  logger,
  now = () => new Date(),
}: Td2ProcessorDeps) {
  return async (job: Td2Job): Promise<void> => {
    const event = await findTd2Event(db, job.data.eventId);
    // Supprimée ou annulée entre-temps : le message dit déjà tout
    if (!event || event.cancelledAt) return;
    const current = now();
    const lead = event.scheduledAt.getTime() - current.getTime();

    try {
      if (job.name === 'remind') {
        if (lead > TD2_REMINDER_MS + STALE_MARGIN_MS) return;
        await sendTd2Notice(client, event, reminderMessage(event));
        logger.info(
          { eventId: event.id, players: event.signups.length },
          'Rappel de sortie envoyé',
        );
        return;
      }
      if (lead > STALE_MARGIN_MS) return;
      // L'heure est là : le message passe en « commencée », sans boutons
      const startedAt = new Date(Math.max(current.getTime(), event.scheduledAt.getTime()));
      await syncTd2Message(client, db, event, startedAt);
    } catch (err) {
      // Discord indisponible : BullMQ réessaiera. Salon supprimé : rien à faire de plus
      if (!isLastingPublishError(err)) throw err;
      logger.warn({ err, eventId: event.id, job: job.name }, 'Sortie TD2 : message impossible');
    }
  };
}
