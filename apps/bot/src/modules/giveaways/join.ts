import { findGiveaway, joinGiveaway, leaveGiveaway } from '@phenix/database';
import { REFRESH_DELAY_MS } from '@phenix/jobs';
import { MessageFlags } from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import { alreadyJoinedReply } from './messages.js';

export const JOIN_REPLIES = {
  missing: "Ce giveaway n'existe plus.",
  ended: 'Ce giveaway est terminé.',
  left: 'Tu ne participes plus à ce giveaway.',
  notEntered: 'Tu ne participais pas à ce giveaway.',
  joined: (prize: string) => `Tu participes au giveaway **${prize}**. Bonne chance !`,
  missingRole: (roleId: string) => `Ce giveaway est réservé au rôle <@&${roleId}>.`,
} as const;

const ephemeral = (content: string) =>
  ({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  }) as const;

/**
 * Bouton « Participer ». La base tranche les cas limites : un clic pendant le tirage attend
 * qu'il finisse puis répond « terminé », un double clic ne compte qu'une fois.
 * Le compteur du message se met à jour quelques secondes plus tard, en un seul envoi.
 */
export const joinGiveawayButton: ComponentHandler = {
  prefix: 'giveaway:join',
  async execute(interaction, id, { db, giveaways }) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const giveawayId = Number(id);
    const giveaway = Number.isSafeInteger(giveawayId) ? await findGiveaway(db, giveawayId) : null;
    if (!giveaway || giveaway.guildId !== interaction.guildId) {
      await interaction.reply(ephemeral(JOIN_REPLIES.missing));
      return;
    }
    if (giveaway.endedAt) {
      await interaction.reply(ephemeral(JOIN_REPLIES.ended));
      return;
    }
    const { requiredRoleId } = giveaway;
    if (requiredRoleId && !interaction.member.roles.cache.has(requiredRoleId)) {
      await interaction.reply(ephemeral(JOIN_REPLIES.missingRole(requiredRoleId)));
      return;
    }

    const result = await joinGiveaway(db, giveawayId, {
      userId: interaction.user.id,
      displayName: interaction.member.displayName,
    });
    switch (result) {
      case 'joined':
        await interaction.reply(ephemeral(JOIN_REPLIES.joined(giveaway.prize)));
        await giveaways.publish(giveawayId, { delayMs: REFRESH_DELAY_MS });
        return;
      case 'already':
        await interaction.reply({
          ...alreadyJoinedReply(giveawayId),
          flags: MessageFlags.Ephemeral,
        });
        return;
      case 'ended':
        await interaction.reply(ephemeral(JOIN_REPLIES.ended));
        return;
      case 'missing':
        await interaction.reply(ephemeral(JOIN_REPLIES.missing));
    }
  },
};

/** Bouton « Me retirer », sous la réponse éphémère : il remplace cette réponse. */
export const leaveGiveawayButton: ComponentHandler = {
  prefix: 'giveaway:leave',
  async execute(interaction, id, { db, giveaways }) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const giveawayId = Number(id);
    if (!Number.isSafeInteger(giveawayId)) return;

    const result = await leaveGiveaway(db, giveawayId, interaction.user.id);
    const content = {
      left: JOIN_REPLIES.left,
      'not-entered': JOIN_REPLIES.notEntered,
      ended: JOIN_REPLIES.ended,
      missing: JOIN_REPLIES.missing,
    }[result];
    await interaction.update({ content, components: [] });
    if (result === 'left') await giveaways.publish(giveawayId, { delayMs: REFRESH_DELAY_MS });
  },
};
