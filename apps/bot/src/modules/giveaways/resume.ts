import { findGiveawaysToResume, type PrismaClient } from '@phenix/database';
import type { GiveawayScheduler } from '@phenix/jobs';
import type { Client } from 'discord.js';
import type { Logger } from '../../logger.js';

/**
 * Au démarrage : remet dans la file tout ce qui reste à faire, d'après la base.
 * Les tâches survivent déjà aux redémarrages dans Valkey ; ce passage couvre le reste
 * (Valkey vidé, tâche abandonnée après cinq échecs pendant une panne de Discord).
 * Rien n'est fait deux fois : les ID de tâche empêchent les doublons, et un giveaway tiré
 * n'est jamais retiré au sort.
 */
export async function resumeGiveaways(
  client: Client<true>,
  db: Pick<PrismaClient, 'giveaway' | 'giveawayEntry'>,
  scheduler: GiveawayScheduler,
  logger: Pick<Logger, 'info'>,
): Promise<void> {
  const rows = await findGiveawaysToResume(db, [...client.guilds.cache.keys()]);
  for (const row of rows) {
    if (row.endedAt) {
      // Tiré mais pas annoncé : la tâche « end » annonce sans retirer au sort
      await scheduler.endNow(row.id);
      continue;
    }
    if (!row.messageId) await scheduler.publish(row.id);
    await scheduler.scheduleEnd(row.id, row.endsAt);
  }
  if (rows.length > 0) logger.info({ count: rows.length }, 'Giveaways repris');
}
