import {
  findPendingRolePanels,
  findRolePanel,
  markRolePanelFailed,
  markRolePanelPublished,
  type PrismaClient,
} from '@phenix/database';
import { DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
import type { Logger } from '../../logger.js';
import { rolePanelMessage } from './panel-message.js';

type Db = Pick<PrismaClient, 'rolePanel'>;
type Log = Pick<Logger, 'info' | 'warn'>;

/** Une erreur dont le message peut être montré tel quel sur le site. */
class PublishError extends Error {}

const isDiscordError = (err: unknown, code: RESTJSONErrorCodes) =>
  err instanceof DiscordAPIError && err.code === code;

/** Traduit l'échec en une phrase pour l'admin qui regarde le site. */
export function describePublishError(err: unknown): string {
  if (err instanceof PublishError) return err.message;
  if (isDiscordError(err, RESTJSONErrorCodes.UnknownChannel)) return "Ce salon n'existe plus";
  if (isDiscordError(err, RESTJSONErrorCodes.MissingAccess)) return 'Le bot ne voit pas ce salon';
  if (isDiscordError(err, RESTJSONErrorCodes.MissingPermissions)) {
    return "Le bot n'a pas le droit d'écrire ou d'intégrer des liens dans ce salon";
  }
  if (isDiscordError(err, RESTJSONErrorCodes.InvalidFormBodyOrContentType)) {
    return 'Discord refuse le message : vérifie les emojis des boutons';
  }
  return 'Erreur inattendue : voir les logs du bot';
}

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
    const channel = await client.channels.fetch(panel.channelId);
    if (!channel?.isSendable() || !('guildId' in channel) || channel.guildId !== panel.guildId) {
      throw new PublishError('Salon introuvable ou sans messages');
    }
    const message = rolePanelMessage(panel);

    let messageId = panel.messageId;
    if (messageId) {
      try {
        await channel.messages.edit(messageId, message);
      } catch (err) {
        // Message supprimé à la main sur Discord : on en poste un nouveau
        if (!isDiscordError(err, RESTJSONErrorCodes.UnknownMessage)) throw err;
        messageId = null;
      }
    }
    messageId ??= (await channel.send(message)).id;

    await markRolePanelPublished(db, panel.id, messageId);
    logger.info({ panelId, guildId: panel.guildId }, 'Panel de rôles publié');
  } catch (err) {
    logger.warn({ err, panelId }, 'Publication du panel impossible');
    await markRolePanelFailed(db, panel.id, describePublishError(err));
  }
}

/** Retire le message d'un panel supprimé ou déplacé. Un message déjà disparu n'est pas une erreur. */
export async function removeRolePanelMessage(
  client: Client,
  { channelId, messageId }: { channelId: string; messageId: string },
  logger: Log,
): Promise<void> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased() && !channel.isDMBased()) await channel.messages.delete(messageId);
  } catch (err) {
    if (isDiscordError(err, RESTJSONErrorCodes.UnknownMessage)) return;
    if (isDiscordError(err, RESTJSONErrorCodes.UnknownChannel)) return;
    logger.warn({ err, channelId, messageId }, 'Message du panel impossible à retirer');
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
