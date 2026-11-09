import {
  findPendingTicketPanels,
  findTicketPanel,
  markTicketPanelFailed,
  markTicketPanelPublished,
  type PrismaClient,
} from '@phenix/database';
import type { Client } from 'discord.js';
import { describePublishError, postOrEditMessage } from '../../core/publish.js';
import type { Logger } from '../../logger.js';
import { ticketPanelMessage } from './messages.js';

type Db = Pick<PrismaClient, 'ticketPanel'>;
type Log = Pick<Logger, 'info' | 'warn'>;

/** Poste le panel « Ouvrir un ticket » du serveur, ou modifie son message. Même règle que les panels de rôles. */
export async function publishTicketPanel(
  client: Client,
  db: Db,
  guildId: string,
  logger: Log,
): Promise<void> {
  const panel = await findTicketPanel(db, guildId);
  if (!panel) return;

  try {
    const messageId = await postOrEditMessage(client, panel, ticketPanelMessage(panel));
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
