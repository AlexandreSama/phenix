import {
  closeTicket,
  findOpenTicketChannels,
  findTicketByChannel,
  type PrismaClient,
} from '@phenix/database';
import type { Client, DMChannel, NonThreadGuildBasedChannel } from 'discord.js';
import type { Logger } from '../../logger.js';

type Db = Pick<PrismaClient, 'ticket'>;
type Log = Pick<Logger, 'info' | 'error'>;

/** Les messages sont partis avec le salon : le ticket est fermé, sans transcript ni auteur. */
const DELETED_BY_HAND = {
  closedById: null,
  closedByName: null,
  transcriptKey: null,
  messageCount: null,
};

/**
 * Un salon de ticket supprimé à la main sur Discord : on ferme son ticket en base,
 * sinon son auteur ne pourrait plus en ouvrir un autre.
 */
export function createTicketChannelDeleteHandler(db: Db, logger: Log) {
  return async (channel: DMChannel | NonThreadGuildBasedChannel): Promise<void> => {
    if (channel.isDMBased()) return;
    try {
      const ticket = await findTicketByChannel(db, channel.id);
      // Fermé par le bouton : déjà CLOSED avant que le bot supprime le salon
      if (ticket?.status !== 'OPEN') return;
      await closeTicket(db, ticket.id, DELETED_BY_HAND);
      logger.info(
        { guildId: ticket.guildId, number: ticket.number },
        'Salon de ticket supprimé à la main',
      );
    } catch (err) {
      logger.error({ err, channelId: channel.id }, 'Suivi du salon supprimé impossible');
    }
  };
}

/** Au démarrage : les salons supprimés pendant que le bot était éteint. Renvoie le nombre de tickets fermés. */
export async function closeOrphanTickets(
  client: Client<true>,
  db: Db,
  logger: Log,
): Promise<number> {
  const open = await findOpenTicketChannels(db, [...client.guilds.cache.keys()]);
  // L'intent Guilds met tous les salons des serveurs en cache dès la connexion
  const orphans = open.filter((ticket) => !client.channels.cache.has(ticket.channelId));
  for (const ticket of orphans) await closeTicket(db, ticket.id, DELETED_BY_HAND);
  if (orphans.length > 0) logger.info({ count: orphans.length }, 'Tickets sans salon fermés');
  return orphans.length;
}
