import {
  findPendingRolePanels,
  findRolePanel,
  markRolePanelFailed,
  markRolePanelPublished,
  type PrismaClient,
} from '@phenix/database';
import type { Client } from 'discord.js';
import { describePublishError, postOrEditMessage } from '../../core/publish.js';
import type { Logger } from '../../logger.js';
import { rolePanelMessage } from './panel-message.js';

type Db = Pick<PrismaClient, 'rolePanel'>;
type Log = Pick<Logger, 'info' | 'warn'>;

/**
 * Poste le panel, ou modifie son message s'il existe déjà, puis l'écrit en base.
 * Un échec est enregistré sur le panel : le site l'affiche à l'admin au lieu de rester « en attente ».
 */
export async function publishRolePanel(
  client: Client,
  db: Db,
  panelId: number,
  logger: Log,
): Promise<void> {
  const panel = await findRolePanel(db, panelId);
  if (!panel) return; // supprimé entre-temps

  try {
    const messageId = await postOrEditMessage(client, panel, rolePanelMessage(panel));
    await markRolePanelPublished(db, panel.id, messageId);
    logger.info({ panelId, guildId: panel.guildId }, 'Panel de rôles publié');
  } catch (err) {
    logger.warn({ err, panelId }, 'Publication du panel impossible');
    await markRolePanelFailed(db, panel.id, describePublishError(err));
  }
}

/** Au démarrage : publie les panels enregistrés sur le site pendant que le bot était éteint. */
export async function publishPendingRolePanels(
  client: Client<true>,
  db: Db,
  logger: Log,
): Promise<void> {
  const pending = await findPendingRolePanels(db, [...client.guilds.cache.keys()]);
  for (const { id } of pending) await publishRolePanel(client, db, id, logger);
  if (pending.length > 0) logger.info({ count: pending.length }, 'Panels en attente publiés');
}
