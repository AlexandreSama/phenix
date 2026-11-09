import type { Ticket, TicketPanel } from '@phenix/database';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  time,
  TimestampStyles,
  type EmbedBuilder,
  type MessageCreateOptions,
} from 'discord.js';
import { buildCustomId } from '../../core/custom-id.js';
import { baseEmbed, COLORS } from '../../core/embeds.js';

/** Un seul bouton « Ouvrir » par serveur : pas besoin d'ID dans le customId. */
export const OPEN_CUSTOM_ID = buildCustomId('ticket', 'open');
export const closeCustomId = (ticketId: number) => buildCustomId('ticket', 'close', ticketId);
export const confirmCustomId = (ticketId: number) => buildCustomId('ticket', 'confirm', ticketId);
export const CANCEL_CUSTOM_ID = buildCustomId('ticket', 'cancel');

/** Délai entre la fermeture et la suppression du salon : le temps de lire le dernier message. */
export const DELETE_DELAY_MS = 5000;

export function ticketPanelMessage(
  panel: Pick<TicketPanel, 'title' | 'description' | 'buttonLabel'>,
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = baseEmbed().setTitle(panel.title);
  if (panel.description) embed.setDescription(panel.description);
  const button = new ButtonBuilder()
    .setCustomId(OPEN_CUSTOM_ID)
    .setLabel(panel.buttonLabel)
    .setEmoji('🎫')
    .setStyle(ButtonStyle.Primary);
  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

/** Le premier message du salon : il prévient l'auteur et l'équipe, et porte le bouton « Fermer ». */
export function welcomeMessage(
  ticket: Pick<Ticket, 'id' | 'number' | 'ownerId'>,
  staffRoleIds: string[],
): MessageCreateOptions {
  const staff = staffRoleIds.map((id) => `<@&${id}>`).join(' ');
  const embed = baseEmbed()
    .setTitle(`Ticket #${ticket.number}`)
    .setDescription(
      'Explique ta demande ici : un membre de l’équipe te répond dès que possible.\n' +
        'Quand c’est réglé, ferme le ticket avec le bouton ci-dessous.',
    );
  const close = new ButtonBuilder()
    .setCustomId(closeCustomId(ticket.id))
    .setLabel('Fermer le ticket')
    .setEmoji('🔒')
    .setStyle(ButtonStyle.Danger);
  return {
    content: `<@${ticket.ownerId}> ${staff}`.trim(),
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(close)],
    // Ne notifie que l'auteur et les rôles de l'équipe, rien d'autre
    allowedMentions: { users: [ticket.ownerId], roles: staffRoleIds },
  };
}

/** La question posée avant de fermer : visible seulement de celui qui a cliqué. */
export function confirmCloseMessage(ticketId: number) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmCustomId(ticketId))
      .setLabel('Fermer')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CANCEL_CUSTOM_ID)
      .setLabel('Annuler')
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    content:
      'Fermer ce ticket ? Le salon sera supprimé ; sa conversation reste lisible sur le site.',
    components: [row],
  };
}

export interface ClosedTicketLog {
  ticket: Pick<Ticket, 'id' | 'number' | 'ownerId' | 'guildId' | 'createdAt'>;
  closedById: string;
  closedAt: Date;
  messageCount: number;
  /** Adresse du site ; sans elle, pas de bouton vers le transcript */
  publicUrl?: string;
}

/** L'embed posté dans le salon de logs des tickets. */
export function closedTicketLog({
  ticket,
  closedById,
  closedAt,
  messageCount,
  publicUrl,
}: ClosedTicketLog): MessageCreateOptions {
  const embed = baseEmbed(COLORS.danger)
    .setTitle(`Ticket #${ticket.number} fermé`)
    .addFields(
      { name: 'Ouvert par', value: `<@${ticket.ownerId}>`, inline: true },
      { name: 'Fermé par', value: `<@${closedById}>`, inline: true },
      { name: 'Messages', value: String(messageCount), inline: true },
      {
        name: 'Ouvert',
        value: time(ticket.createdAt, TimestampStyles.RelativeTime),
        inline: true,
      },
    )
    .setTimestamp(closedAt);
  const components = publicUrl
    ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Lire le transcript')
            .setURL(`${publicUrl}/dashboard/${ticket.guildId}/tickets/${ticket.id}`),
        ),
      ]
    : [];
  // Les mentions de l'embed s'affichent sans notifier : allowedMentions vide par prudence
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}
