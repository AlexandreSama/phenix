import type { Td2EventDetails, Td2Promotion, Td2Role } from '@phenix/database';
import { TD2_KIND_LABELS, TD2_ROLE_LABELS } from '@phenix/shared';
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

/** L'ordre d'affichage des rôles, sur l'embed comme sur les boutons. */
export const ROLE_ORDER: Td2Role[] = ['DPS', 'HEAL', 'TANK', 'HEAL_TANK'];

export const isTd2Role = (value: string | undefined): value is Td2Role =>
  ROLE_ORDER.includes(value as Td2Role);

export const joinCustomId = (eventId: number, role: Td2Role) =>
  buildCustomId('td2', 'join', `${eventId}:${role}`);
export const leaveCustomId = (eventId: number) => buildCustomId('td2', 'leave', eventId);
export const manageCustomId = (eventId: number) => buildCustomId('td2', 'manage', eventId);
export const rescheduleCustomId = (eventId: number) => buildCustomId('td2', 'reschedule', eventId);
export const dateModalCustomId = (eventId: number) => buildCustomId('td2', 'date', eventId);
export const cancelCustomId = (eventId: number) => buildCustomId('td2', 'cancel', eventId);
export const confirmCancelCustomId = (eventId: number) =>
  buildCustomId('td2', 'confirmcancel', eventId);
export const KEEP_CUSTOM_ID = buildCustomId('td2', 'keep');

type EventView = Pick<
  Td2EventDetails,
  'id' | 'scheduledAt' | 'organizerId' | 'cancelledAt' | 'mode' | 'slots' | 'signups'
>;

const KIND_ICONS = { RAID: '⚔️', INCURSION: '🛡️' } as const;

/** « ⚔️ Raid Dark Hours · Normal », « 🛡️ Incursion Paradis Perdu » : les incursions n'ont qu'un mode. */
export function eventTitle(event: Pick<EventView, 'mode'>): string {
  const { activity } = event.mode;
  const mode = activity.kind === 'RAID' ? ` · ${event.mode.name}` : '';
  return `${KIND_ICONS[activity.kind]} ${TD2_KIND_LABELS[activity.kind]} ${activity.name}${mode}`;
}

const mentions = (userIds: string[]) => userIds.map((id) => `<@${id}>`).join(' ');
const slotsInOrder = (event: Pick<EventView, 'slots'>) =>
  ROLE_ORDER.flatMap((role) => event.slots.filter((slot) => slot.role === role));

/** Les inscrits confirmés d'un rôle, et ceux en réserve tous rôles confondus. */
export function lineup(event: Pick<EventView, 'signups'>) {
  const confirmed = (role: Td2Role) =>
    event.signups.filter((signup) => signup.role === role && signup.status === 'CONFIRMED');
  const reserve = event.signups.filter((signup) => signup.status === 'RESERVE');
  return { confirmed, reserve };
}

/** La place d'un joueur dans la réserve de son rôle : 1 pour le prochain à monter. */
export function reservePosition(event: Pick<EventView, 'signups'>, userId: string): number {
  const signup = event.signups.find((entry) => entry.userId === userId);
  if (!signup || signup.status !== 'RESERVE') return 0;
  const queue = event.signups.filter(
    (entry) => entry.role === signup.role && entry.status === 'RESERVE',
  );
  return queue.findIndex((entry) => entry.userId === userId) + 1;
}

/**
 * Le message de la sortie, régénéré depuis la base à chaque changement :
 * ouverte (boutons), commencée (plus de boutons) ou annulée.
 */
export function td2EventMessage(
  event: EventView,
  now = new Date(),
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const { confirmed, reserve } = lineup(event);
  const slots = slotsInOrder(event);
  const capacity = slots.reduce((total, slot) => total + slot.count, 0);
  const filled = slots.reduce((total, slot) => total + confirmed(slot.role).length, 0);
  const started = event.scheduledAt.getTime() <= now.getTime();
  const when = `${time(event.scheduledAt, TimestampStyles.LongDateTime)} (${time(event.scheduledAt, TimestampStyles.RelativeTime)})`;

  const lines = event.cancelledAt
    ? [`~~${time(event.scheduledAt, TimestampStyles.LongDateTime)}~~`, 'Sortie annulée.']
    : [
        started
          ? `📅 Commencée ${time(event.scheduledAt, TimestampStyles.RelativeTime)}`
          : `📅 ${when}`,
        `Organisée par <@${event.organizerId}>`,
        `👥 ${filled}/${capacity} joueurs${reserve.length > 0 ? ` · ${reserve.length} en réserve` : ''}`,
      ];

  const color = event.cancelledAt ? COLORS.danger : started ? COLORS.warning : COLORS.primary;
  const embed = baseEmbed(color)
    .setTitle(`${event.cancelledAt ? 'Annulée — ' : ''}${eventTitle(event)}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Sortie #${event.id}` });

  if (!event.cancelledAt) {
    embed.addFields(
      slots.map((slot) => {
        const players = confirmed(slot.role);
        return {
          name: `${TD2_ROLE_LABELS[slot.role]} (${players.length}/${slot.count})`,
          value: players.length > 0 ? mentions(players.map((signup) => signup.userId)) : '—',
          inline: true,
        };
      }),
    );
    if (reserve.length > 0) {
      embed.addFields({
        name: 'Réserve',
        value: reserve
          .map((signup) => `<@${signup.userId}> (${TD2_ROLE_LABELS[signup.role]})`)
          .join('\n'),
      });
    }
  }

  // Annulée ou commencée : la liste reste lisible, mais on ne s'inscrit plus
  if (event.cancelledAt || started) return { embeds: [embed], components: [] };

  const roles = new ActionRowBuilder<ButtonBuilder>().addComponents(
    slots.map((slot) => {
      const count = confirmed(slot.role).length;
      return (
        new ButtonBuilder()
          .setCustomId(joinCustomId(event.id, slot.role))
          .setLabel(`${TD2_ROLE_LABELS[slot.role]} ${count}/${slot.count}`)
          // Un rôle complet reste cliquable : on y entre en réserve
          .setStyle(count < slot.count ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );
    }),
  );
  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(leaveCustomId(event.id))
      .setLabel('Se désinscrire')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(manageCustomId(event.id))
      .setLabel('Gérer')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [roles, actions] };
}

/** Une réponse au message de la sortie, qui ne notifie que les joueurs nommés. */
function notice(content: string, messageId: string | null, notify: string[]): MessageCreateOptions {
  return {
    content,
    ...(messageId && { reply: { messageReference: messageId, failIfNotExists: false } }),
    allowedMentions: { users: notify },
  };
}

const everyone = (event: Pick<EventView, 'signups'>) =>
  event.signups.map((signup) => signup.userId);

/** Le rappel, un quart d'heure avant ; null s'il n'y a personne à prévenir. */
export function reminderMessage(
  event: EventView & { messageId: string | null },
): MessageCreateOptions | null {
  if (event.signups.length === 0) return null;
  const { reserve } = lineup(event);
  const team = event.signups.filter((signup) => signup.status === 'CONFIRMED');
  const lines = [
    `⏰ **${eventTitle(event)}** commence ${time(event.scheduledAt, TimestampStyles.RelativeTime)} !`,
    team.length > 0 ? `Équipe : ${mentions(team.map((signup) => signup.userId))}` : '',
    reserve.length > 0
      ? `Réserve, au cas où : ${mentions(reserve.map((signup) => signup.userId))}`
      : '',
  ].filter(Boolean);
  return notice(lines.join('\n'), event.messageId, everyone(event));
}

/** Prévient ceux qui montent de la réserve. */
export function promotionMessage(
  event: EventView & { messageId: string | null },
  promotions: Td2Promotion[],
): MessageCreateOptions {
  const content = promotions
    .map(
      ({ userId, role }) =>
        `🎉 <@${userId}>, une place de ${TD2_ROLE_LABELS[role]} s’est libérée : tu passes dans l’équipe de **${eventTitle(event)}** !`,
    )
    .join('\n');
  return notice(
    content,
    event.messageId,
    promotions.map((promotion) => promotion.userId),
  );
}

/** Prévient les inscrits d'une nouvelle date. */
export function rescheduleNotice(
  event: EventView & { messageId: string | null },
): MessageCreateOptions {
  const content =
    `📅 **${eventTitle(event)}** est déplacée au ${time(event.scheduledAt, TimestampStyles.LongDateTime)} ` +
    `(${time(event.scheduledAt, TimestampStyles.RelativeTime)}). ${mentions(everyone(event))}`;
  return notice(content.trim(), event.messageId, everyone(event));
}

/** Prévient les inscrits d'une annulation. */
export function cancelNotice(
  event: EventView & { messageId: string | null },
): MessageCreateOptions {
  const content =
    `❌ **${eventTitle(event)}** du ${time(event.scheduledAt, TimestampStyles.LongDateTime)} est annulée. ` +
    mentions(everyone(event));
  return notice(content.trim(), event.messageId, everyone(event));
}

/** Le menu « Gérer », visible du seul organisateur. */
export function manageMenu(event: Pick<EventView, 'id' | 'mode'>) {
  return {
    content: `Que veux-tu faire pour **${eventTitle(event)}** ?`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(rescheduleCustomId(event.id))
          .setLabel('Changer la date')
          .setEmoji('📅')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(cancelCustomId(event.id))
          .setLabel('Annuler la sortie')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

/** La question avant d'annuler. */
export function confirmCancelMenu(event: Pick<EventView, 'id' | 'mode'>) {
  return {
    content: `Annuler **${eventTitle(event)}** ? Les inscrits seront prévenus.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(confirmCancelCustomId(event.id))
          .setLabel('Oui, annuler')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(KEEP_CUSTOM_ID)
          .setLabel('Non, garder')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
