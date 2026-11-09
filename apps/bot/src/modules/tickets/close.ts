import { closeTicket, findTicket, type Ticket } from '@phenix/database';
import { MessageFlags, type ButtonInteraction, type GuildTextBasedChannel } from 'discord.js';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ComponentHandler } from '../../core/command.js';
import type { BotContext } from '../../core/context.js';
import { canCloseTicket } from './access.js';
import {
  closedTicketLog,
  confirmCloseMessage,
  DELETE_DELAY_MS,
  type ClosedTicketLog,
} from './messages.js';
import { transcriptKey } from './permissions.js';
import { fetchChannelMessages, renderTranscript, toTranscriptMessage } from './transcript.js';

export const CLOSE_REPLIES = {
  stale: 'Ce ticket est déjà fermé.',
  denied: "Seuls l'auteur du ticket et l'équipe peuvent le fermer.",
  inProgress: 'La fermeture est déjà en cours…',
  working: 'Fermeture en cours : je recopie la conversation…',
  storageDown:
    "Impossible d'enregistrer la conversation (stockage injoignable). " +
    'Le ticket reste ouvert : réessaie dans un instant.',
  cancelled: 'Le ticket reste ouvert.',
} as const;

export interface CloseOptions {
  /** Remplacés dans les tests : pas d'attente réelle, une date fixe */
  wait?: (ms: number) => Promise<unknown>;
  now?: () => Date;
}

type CachedButton = ButtonInteraction<'cached'>;

/** Le ticket du bouton, s'il est encore ouvert et que ce membre a le droit de le fermer. */
async function closableTicket(
  interaction: CachedButton,
  id: string | undefined,
  { db, configs }: BotContext,
): Promise<Ticket | string> {
  const ticket = await findTicket(db, Number(id));
  if (
    !ticket ||
    ticket.guildId !== interaction.guildId ||
    ticket.channelId !== interaction.channelId ||
    ticket.status !== 'OPEN'
  ) {
    return CLOSE_REPLIES.stale;
  }
  const staffRoleIds = (await configs.get(interaction.guildId))?.ticketStaffRoleIds ?? [];
  return canCloseTicket(interaction.member, ticket, staffRoleIds) ? ticket : CLOSE_REPLIES.denied;
}

const ephemeral = (interaction: CachedButton, content: string) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral });

/** Poste le résumé dans le salon de logs des tickets, s'il y en a un. Un échec ne bloque pas la fermeture. */
async function postLog(interaction: CachedButton, context: BotContext, log: ClosedTicketLog) {
  const settings = await context.configs.get(interaction.guildId);
  const channel = settings?.ticketLogChannelId
    ? interaction.guild.channels.cache.get(settings.ticketLogChannelId)
    : undefined;
  if (!channel?.isSendable()) return;
  try {
    await channel.send(closedTicketLog(log));
  } catch (err) {
    context.logger.warn({ err, guildId: interaction.guildId }, 'Log du ticket impossible à poster');
  }
}

/**
 * La fermeture, dans l'ordre : transcript dans Garage, ticket fermé en base, log, puis
 * suppression du salon. Si Garage ne répond pas, on s'arrête avant de toucher à quoi que ce soit.
 */
async function closeTicketChannel(
  interaction: CachedButton,
  ticket: Ticket,
  context: BotContext,
  { wait = sleep, now = () => new Date() }: CloseOptions,
) {
  const { db, logger, transcripts } = context;
  const channel = interaction.channel as GuildTextBasedChannel;
  const member = interaction.member;
  await interaction.update({ content: CLOSE_REPLIES.working, components: [] });

  const messages = await fetchChannelMessages(channel);
  const closedAt = now();
  const settings = await context.configs.get(interaction.guildId);
  const key = transcriptKey(ticket.guildId, ticket.number);
  const html = renderTranscript({
    guildName: interaction.guild.name,
    ticketNumber: ticket.number,
    ownerName: ticket.ownerName ?? ticket.ownerId,
    closedByName: member.displayName,
    openedAt: ticket.createdAt,
    closedAt,
    timeZone: settings?.timezone ?? 'Europe/Paris',
    messages: messages.map(toTranscriptMessage),
  });

  try {
    await transcripts.put(key, html, 'text/html; charset=utf-8');
  } catch (err) {
    logger.error({ err, ticketId: ticket.id }, 'Transcript impossible à enregistrer');
    await interaction.editReply(CLOSE_REPLIES.storageDown);
    return;
  }

  const closed = await closeTicket(db, ticket.id, {
    closedById: member.id,
    closedByName: member.displayName,
    transcriptKey: key,
    messageCount: messages.length,
    now: closedAt,
  });
  if (!closed) {
    await interaction.editReply(CLOSE_REPLIES.stale);
    return;
  }
  logger.info({ guildId: ticket.guildId, number: ticket.number }, 'Ticket fermé');

  await postLog(interaction, context, {
    ticket,
    closedById: member.id,
    closedAt,
    messageCount: messages.length,
    publicUrl: context.publicUrl,
  });

  await channel.send({
    content: `🔒 Ticket fermé par ${member}. Ce salon sera supprimé dans ${DELETE_DELAY_MS / 1000} secondes.`,
    allowedMentions: { parse: [] },
  });
  await wait(DELETE_DELAY_MS);
  try {
    await channel.delete(`Ticket #${ticket.number} fermé par ${member.user.tag}`);
  } catch (err) {
    logger.warn({ err, channelId: channel.id }, 'Salon du ticket impossible à supprimer');
    await channel
      .send("Je n'ai pas pu supprimer ce salon : un admin peut le faire à la main.")
      .catch(() => undefined);
  }
}

/** Les trois boutons de fermeture : « Fermer le ticket », puis « Fermer » ou « Annuler ». */
export function createCloseTicketButtons(options: CloseOptions = {}): ComponentHandler[] {
  // Deux membres de l'équipe qui confirment en même temps : une seule fermeture
  const closing = new Set<number>();

  const ask: ComponentHandler = {
    prefix: 'ticket:close',
    async execute(interaction, id, context) {
      if (!interaction.isButton() || !interaction.inCachedGuild()) return;
      const ticket = await closableTicket(interaction, id, context);
      if (typeof ticket === 'string') {
        await ephemeral(interaction, ticket);
        return;
      }
      await interaction.reply({
        ...confirmCloseMessage(ticket.id),
        flags: MessageFlags.Ephemeral,
      });
    },
  };

  const confirm: ComponentHandler = {
    prefix: 'ticket:confirm',
    async execute(interaction, id, context) {
      if (!interaction.isButton() || !interaction.inCachedGuild()) return;
      const ticket = await closableTicket(interaction, id, context);
      if (typeof ticket === 'string') {
        await interaction.update({ content: ticket, components: [] });
        return;
      }
      if (closing.has(ticket.id)) {
        await interaction.update({ content: CLOSE_REPLIES.inProgress, components: [] });
        return;
      }
      closing.add(ticket.id);
      try {
        await closeTicketChannel(interaction, ticket, context, options);
      } finally {
        closing.delete(ticket.id);
      }
    },
  };

  const cancel: ComponentHandler = {
    prefix: 'ticket:cancel',
    async execute(interaction) {
      if (!interaction.isButton()) return;
      await interaction.update({ content: CLOSE_REPLIES.cancelled, components: [] });
    },
  };

  return [ask, confirm, cancel];
}
