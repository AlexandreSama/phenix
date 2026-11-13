import { claimTicket, findTicket, findTicketType } from '@phenix/database';
import { escapeMarkdown, MessageFlags, type ButtonInteraction } from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import type { BotContext } from '../../core/context.js';
import { parseTicketId, STRICT_ESCAPE, welcomeButtons } from './messages.js';

export const CLAIM_REPLIES = {
  stale: 'Ce ticket est déjà fermé.',
  owner: 'Tu ne peux pas prendre en charge ton propre ticket.',
  denied: 'Seuls les membres de l’équipe de ce type de ticket peuvent le prendre en charge.',
  claimedBy: (name: string) =>
    `Ce ticket est déjà pris en charge par ${escapeMarkdown(name, STRICT_ESCAPE)}.`,
} as const;

const ephemeral = (interaction: ButtonInteraction<'cached'>, content: string) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral });

/**
 * « Prendre en charge » : réservé à l'équipe du type du ticket, jamais à son auteur. La prise en
 * charge est définitive (ni retrait ni transfert) et un seul membre l'emporte, même si deux
 * cliquent en même temps : c'est la base qui tranche. Aucun journal ne contient de pseudo.
 */
export function createClaimHandler(): ComponentHandler[] {
  const claim: ComponentHandler = {
    prefix: 'ticket:claim',
    async execute(interaction, id, context: BotContext) {
      if (!interaction.isButton() || !interaction.inCachedGuild()) return;
      const { db, logger } = context;
      const { member } = interaction;

      // Un customId peut être forgé : un identifiant mal écrit ne va jamais jusqu'à la base
      const ticketId = parseTicketId(id);
      const ticket = ticketId === null ? null : await findTicket(db, ticketId);
      if (
        !ticket ||
        ticket.guildId !== interaction.guildId ||
        ticket.channelId !== interaction.channelId ||
        ticket.status !== 'OPEN'
      ) {
        await ephemeral(interaction, CLAIM_REPLIES.stale);
        return;
      }
      if (member.id === ticket.ownerId) {
        await ephemeral(interaction, CLAIM_REPLIES.owner);
        return;
      }
      // L'équipe est celle du type du ticket ; sans type, ou avec un type d'un autre serveur
      // (défense en profondeur), il n'y a pas d'équipe
      const type = ticket.typeId === null ? null : await findTicketType(db, ticket.typeId);
      const staffRoleIds = type?.guildId === ticket.guildId ? type.staffRoleIds : [];
      if (!staffRoleIds.some((roleId) => member.roles.cache.has(roleId))) {
        await ephemeral(interaction, CLAIM_REPLIES.denied);
        return;
      }

      const result = await claimTicket(db, ticket.id, { id: member.id, name: member.displayName });
      if (!result.claimed) {
        await ephemeral(
          interaction,
          result.claimedByName === null
            ? CLAIM_REPLIES.stale
            : CLAIM_REPLIES.claimedBy(result.claimedByName),
        );
        return;
      }

      // Le gagnant retire le bouton du message d'accueil, puis l'annonce dans le salon
      try {
        await interaction.update({ components: welcomeButtons(ticket.id, { claimed: true }) });
      } catch (err) {
        // Message d'accueil supprimé… : la prise en charge est enregistrée, l'annonce suit quand même
        logger.warn(
          { err, ticketId: ticket.id },
          'Retrait du bouton « Prendre en charge » impossible',
        );
      }
      try {
        await interaction.channel?.send({
          content: `${escapeMarkdown(member.displayName, STRICT_ESCAPE)} prend en charge ce ticket.`,
          allowedMentions: { parse: [] },
        });
      } catch (err) {
        // La prise en charge est enregistrée : l'annonce manquée ne la défait pas
        logger.warn({ err, ticketId: ticket.id }, 'Annonce de la prise en charge impossible');
      }
    },
  };
  return [claim];
}
