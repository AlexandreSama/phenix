import { findTd2EventsToResume, type PrismaClient } from '@phenix/database';
import type { Td2Scheduler } from '@phenix/jobs';
import type { Client } from 'discord.js';
import type { Logger } from '../../logger.js';

/**
 * Au démarrage : chaque sortie à venir doit avoir son rappel et sa fermeture dans la file.
 * `ensure` n'ajoute que ce qui manque (Valkey vidé) : une tâche déjà là, même échue pendant
 * que le bot dormait, part telle quelle.
 */
export async function resumeTd2Events(
  client: Client<true>,
  db: Pick<PrismaClient, 'td2Event'>,
  scheduler: Td2Scheduler,
  logger: Pick<Logger, 'info'>,
): Promise<void> {
  const events = await findTd2EventsToResume(db, [...client.guilds.cache.keys()]);
  for (const event of events) await scheduler.ensure(event.id, event.scheduledAt);
  if (events.length > 0) logger.info({ count: events.length }, 'Sorties TD2 reprises');
}
