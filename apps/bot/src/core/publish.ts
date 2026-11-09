import {
  DiscordAPIError,
  Events,
  RESTJSONErrorCodes,
  type Client,
  type MessageCreateOptions,
} from 'discord.js';
import type { Logger } from '../logger.js';

/** Une erreur dont le message peut être montré tel quel sur le site. */
export class PublishError extends Error {}

export const isDiscordError = (err: unknown, code: RESTJSONErrorCodes) =>
  err instanceof DiscordAPIError && err.code === code;

/** Traduit l'échec d'une publication en une phrase pour l'admin qui regarde le site. */
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

export interface PublishTarget {
  guildId: string;
  channelId: string;
  /** Le message déjà posté, à modifier ; null pour en poster un nouveau */
  messageId: string | null;
}

/**
 * Poste un message du bot, ou modifie celui qui existe déjà, et renvoie son ID.
 * Sert à tous les messages que le site fait publier : panels de rôles, panel de tickets…
 */
export async function postOrEditMessage(
  client: Client,
  target: PublishTarget,
  message: Pick<MessageCreateOptions, 'embeds' | 'components'>,
): Promise<string> {
  const channel = await client.channels.fetch(target.channelId);
  if (!channel?.isSendable() || !('guildId' in channel) || channel.guildId !== target.guildId) {
    throw new PublishError('Salon introuvable ou sans messages');
  }

  if (target.messageId) {
    try {
      await channel.messages.edit(target.messageId, message);
      return target.messageId;
    } catch (err) {
      // Message supprimé à la main sur Discord : on en poste un nouveau
      if (!isDiscordError(err, RESTJSONErrorCodes.UnknownMessage)) throw err;
    }
  }
  return (await channel.send(message)).id;
}

/** Retire un message publié par le bot. Un message ou un salon déjà disparu n'est pas une erreur. */
export async function deleteMessageQuietly(
  client: Client,
  { channelId, messageId }: { channelId: string; messageId: string },
  logger: Pick<Logger, 'warn'>,
): Promise<void> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased() && !channel.isDMBased()) await channel.messages.delete(messageId);
  } catch (err) {
    if (isDiscordError(err, RESTJSONErrorCodes.UnknownMessage)) return;
    if (isDiscordError(err, RESTJSONErrorCodes.UnknownChannel)) return;
    logger.warn({ err, channelId, messageId }, 'Message impossible à retirer');
  }
}

/** Attend que le bot soit connecté : un événement du site peut arriver avant. */
export function whenReady(client: Client): Promise<void> {
  return client.isReady()
    ? Promise.resolve()
    : new Promise((resolve) => client.once(Events.ClientReady, () => resolve()));
}
