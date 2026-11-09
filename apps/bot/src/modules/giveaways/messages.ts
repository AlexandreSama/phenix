import type { Giveaway, GiveawayWithCount } from '@phenix/database';
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

export const joinCustomId = (giveawayId: number) => buildCustomId('giveaway', 'join', giveawayId);
export const leaveCustomId = (giveawayId: number) => buildCustomId('giveaway', 'leave', giveawayId);

export type GiveawayView = Pick<
  GiveawayWithCount,
  | 'id'
  | 'prize'
  | 'hostId'
  | 'winnersCount'
  | 'requiredRoleId'
  | 'endsAt'
  | 'endedAt'
  | 'winnerIds'
  | '_count'
>;

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;
const mentions = (userIds: string[]) => userIds.map((id) => `<@${id}>`).join(', ');

/**
 * Le message du giveaway, en cours ou terminé. Le même sert à le poster, à mettre à jour
 * le nombre de participants et à afficher les gagnants : le bot le régénère depuis la base.
 */
export function giveawayMessage(giveaway: GiveawayView): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const entries = giveaway._count.entries;
  const lines: string[] = [];
  if (giveaway.endedAt) {
    lines.push(`Terminé ${time(giveaway.endedAt, TimestampStyles.RelativeTime)}`);
    lines.push(
      giveaway.winnerIds.length > 0
        ? `${giveaway.winnerIds.length > 1 ? 'Gagnants' : 'Gagnant'} : ${mentions(giveaway.winnerIds)}`
        : 'Pas de gagnant : personne à tirer au sort.',
    );
  } else {
    lines.push(
      `Fin ${time(giveaway.endsAt, TimestampStyles.RelativeTime)} ` +
        `(${time(giveaway.endsAt, TimestampStyles.LongDateShortTime)})`,
    );
    lines.push(plural(giveaway.winnersCount, 'gagnant'));
  }
  lines.push(`Organisé par <@${giveaway.hostId}>`);
  if (giveaway.requiredRoleId && !giveaway.endedAt) {
    lines.push(`Réservé au rôle <@&${giveaway.requiredRoleId}>`);
  }

  const embed = baseEmbed(giveaway.endedAt ? COLORS.success : COLORS.fun)
    .setTitle(`🎉 ${giveaway.prize}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Giveaway #${giveaway.id} · ${plural(entries, 'participant')}` })
    .setTimestamp(giveaway.endedAt ?? giveaway.endsAt);

  const button = new ButtonBuilder()
    .setCustomId(joinCustomId(giveaway.id))
    .setLabel(giveaway.endedAt ? 'Terminé' : `Participer (${entries})`)
    .setEmoji('🎉')
    .setStyle(giveaway.endedAt ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setDisabled(giveaway.endedAt !== null);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

/** La réponse au message du giveaway qui annonce les gagnants. Elle ne notifie qu'eux. */
export function announcementMessage(
  giveaway: Pick<Giveaway, 'prize' | 'winnerIds'>,
  { messageId, reroll }: { messageId: string; reroll: boolean },
): MessageCreateOptions {
  const { prize, winnerIds } = giveaway;
  let content: string;
  if (winnerIds.length === 0) {
    content = reroll
      ? `Nouveau tirage impossible pour **${prize}** : plus aucun participant à tirer au sort.`
      : `Giveaway **${prize}** terminé : personne n'a participé, pas de gagnant.`;
  } else {
    const subject = winnerIds.length > 1 ? 'Vous remportez' : 'Tu remportes';
    const congrats = `🎉 Félicitations ${mentions(winnerIds)} ! ${subject} **${prize}**.`;
    content = reroll ? `Nouveau tirage ! ${congrats}` : congrats;
  }
  return {
    content,
    reply: { messageReference: messageId, failIfNotExists: false },
    allowedMentions: { users: winnerIds },
  };
}

/** La réponse au membre qui participe déjà : un bouton pour se retirer. */
export function alreadyJoinedReply(giveawayId: number) {
  const leave = new ButtonBuilder()
    .setCustomId(leaveCustomId(giveawayId))
    .setLabel('Me retirer')
    .setStyle(ButtonStyle.Secondary);
  return {
    content: 'Tu participes déjà à ce giveaway.',
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(leave)],
  };
}
