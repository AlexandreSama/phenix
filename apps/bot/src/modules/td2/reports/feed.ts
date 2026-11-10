import { listTd2FeedChannels, type PrismaClient, type Td2ReportDetails } from '@phenix/database';
import type { Client } from 'discord.js';
import type { Logger } from '../../../logger.js';
import { reportFeedMessage } from './messages.js';

/**
 * Annonce un signalement confirmé dans le fil de chaque serveur qui en a un, celui d'origine
 * compris. Un salon supprimé ou fermé au bot est noté dans les logs, sans arrêter les autres.
 * Renvoie le nombre de serveurs prévenus.
 */
export async function broadcastTd2Report(
  client: Client,
  db: Pick<PrismaClient, 'guildConfig'>,
  report: Td2ReportDetails,
  logger: Pick<Logger, 'warn'>,
): Promise<number> {
  const message = reportFeedMessage(report);
  let sent = 0;
  for (const { guildId, channelId } of await listTd2FeedChannels(db)) {
    // Un serveur dans la base mais plus dans le cache : le bot n'y est plus, on passe
    if (!client.guilds.cache.has(guildId)) continue;
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isSendable()) throw new Error('Salon introuvable ou sans messages');
      await channel.send(message);
      sent += 1;
    } catch (err) {
      logger.warn(
        { err, guildId, channelId, reportId: report.id },
        'Fil des signalements injoignable',
      );
    }
  }
  return sent;
}
