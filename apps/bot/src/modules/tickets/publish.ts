import {
  findPendingTicketPanels,
  findTicketPanel,
  listTicketTypes,
  markTicketPanelFailed,
  markTicketPanelPublished,
  type PrismaClient,
} from '@phenix/database';
import type { Client } from 'discord.js';
import { describePublishError, postOrEditMessage } from '../../core/publish.js';
import type { Logger } from '../../logger.js';
import { ticketPanelMessage } from './messages.js';

type Db = Pick<PrismaClient, 'ticketPanel' | 'ticketType'>;
type Log = Pick<Logger, 'info' | 'warn'>;

/** Montré sur le site quand on publie un panneau dont aucun bouton n'ouvrirait de ticket. */
export const NO_TYPE_ERROR =
  'Aucun type de ticket : ajoute-en au moins un dans l’onglet Tickets avant de publier le Panel';

/**
 * Poste le panneau « Ouvrir un ticket » du serveur, avec un bouton (ou un choix de menu) par type,
 * ou modifie son message. Même règle que les panels de rôles.
 */
export async function publishTicketPanel(
  client: Client,
  db: Db,
  guildId: string,
  logger: Log,
): Promise<void> {
  const panel = await findTicketPanel(db, guildId);
  if (!panel) return;

  const types = await listTicketTypes(db, guildId);
  if (types.length === 0) {
    logger.warn({ guildId }, 'Panel de tickets sans type : publication refusée');
    await markTicketPanelFailed(db, guildId, NO_TYPE_ERROR);
    return;
  }

  try {
    const messageId = await postOrEditMessage(client, panel, ticketPanelMessage(panel, types));
    await markTicketPanelPublished(db, guildId, messageId);
    logger.info({ guildId }, 'Panel de tickets publié');
  } catch (err) {
    logger.warn({ err, guildId }, 'Publication du panel de tickets impossible');
    await markTicketPanelFailed(db, guildId, describePublishError(err));
  }
}

/** Au démarrage : les panels enregistrés pendant que le bot était éteint. */
export async function publishPendingTicketPanels(
  client: Client<true>,
  db: Db,
  logger: Log,
): Promise<void> {
  const pending = await findPendingTicketPanels(db, [...client.guilds.cache.keys()]);
  for (const guildId of pending) await publishTicketPanel(client, db, guildId, logger);
  if (pending.length > 0) logger.info({ count: pending.length }, 'Panels de tickets publiés');
}
