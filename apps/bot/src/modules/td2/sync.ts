import { markTd2EventPublished, type PrismaClient, type Td2EventDetails } from '@phenix/database';
import type { Client, MessageCreateOptions } from 'discord.js';
import { postOrEditMessage, PublishError } from '../../core/publish.js';
import { td2EventMessage } from './messages.js';

/**
 * Remet le message de la sortie d'accord avec la base. S'il a été supprimé à la main,
 * il est reposté et son nouvel ID enregistré : personne ne perd la liste des inscrits.
 */
export async function syncTd2Message(
  client: Client,
  db: Pick<PrismaClient, 'td2Event'>,
  event: Td2EventDetails,
  now = new Date(),
): Promise<string> {
  const messageId = await postOrEditMessage(client, event, td2EventMessage(event, now));
  if (messageId !== event.messageId) await markTd2EventPublished(db, event.id, messageId);
  return messageId;
}

/** Répond au message de la sortie : rappel, montée de la réserve, nouvelle date, annulation. */
export async function sendTd2Notice(
  client: Client,
  event: Pick<Td2EventDetails, 'channelId'>,
  message: MessageCreateOptions | null,
): Promise<void> {
  if (!message) return;
  const channel = await client.channels.fetch(event.channelId);
  if (!channel?.isSendable()) throw new PublishError('Salon introuvable ou sans messages');
  await channel.send(message);
}
