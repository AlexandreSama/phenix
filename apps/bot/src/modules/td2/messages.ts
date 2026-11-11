import type { Td2Directive, Td2EventDetails, Td2Promotion, Td2Role } from '@phenix/database';
import { TD2_REMINDER_MS } from '@phenix/jobs';
import {
  TD2_DIFFICULTY_LABELS,
  TD2_EVENT_KIND_LABELS,
  TD2_SIGNUP_ROLE_LABELS,
} from '@phenix/shared';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  time,
  TimestampStyles,
  type EmbedBuilder,
  type MessageCreateOptions,
} from 'discord.js';
import { buildCustomId } from '../../core/custom-id.js';
import { baseEmbed, COLORS } from '../../core/embeds.js';

/** L'ordre d'affichage des rôles, sur l'embed comme sur les boutons. « Joueur » : les missions. */
export const ROLE_ORDER: Td2Role[] = ['DPS', 'HEAL', 'TANK', 'HEAL_TANK', 'PLAYER'];

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
export const directivesCustomId = (eventId: number) => buildCustomId('td2', 'directives', eventId);

/** Ce qu'il faut d'une sortie pour la nommer : son activité, ou le nom et la difficulté d'une mission. */
type TitleView = Pick<Td2EventDetails, 'mode' | 'missionName' | 'difficulty'>;

type EventView = TitleView &
  Pick<
    Td2EventDetails,
    'id' | 'scheduledAt' | 'organizerId' | 'cancelledAt' | 'directives' | 'slots' | 'signups'
  >;

const KIND_ICONS = { RAID: '⚔️', INCURSION: '🛡️', MISSION: '🎯' } as const;

/**
 * « ⚔️ Raid Dark Hours · Normal », « 🛡️ Incursion Paradis Perdu » (les incursions n'ont qu'un
 * mode), « 🎯 Mission Capitole · Héroïque » (le nom choisi par l'organisateur, et la difficulté).
 */
export function eventTitle(event: TitleView): string {
  if (!event.mode) {
    const difficulty = event.difficulty ? ` · ${TD2_DIFFICULTY_LABELS[event.difficulty]}` : '';
    return `${KIND_ICONS.MISSION} ${TD2_EVENT_KIND_LABELS.MISSION} ${event.missionName ?? ''}${difficulty}`;
  }
  const { activity } = event.mode;
  const mode = activity.kind === 'RAID' ? ` · ${event.mode.name}` : '';
  return `${KIND_ICONS[activity.kind]} ${TD2_EVENT_KIND_LABELS[activity.kind]} ${activity.name}${mode}`;
}

/** Un emoji par rôle : le même sur l'embed et sur les boutons. */
export const ROLE_EMOJIS = {
  DPS: '🗡️',
  HEAL: '💉',
  TANK: '🛡️',
  HEAL_TANK: '⛑️',
  PLAYER: '👥',
} as const satisfies Record<Td2Role, string>;

/** « ▰▰▰▰▰▱▱▱ » : une case par place, dix au plus. */
export function progressBar(filled: number, total: number): string {
  const width = Math.min(total, 10);
  const full = total === 0 ? 0 : Math.min(width, Math.round((filled / total) * width));
  return '▰'.repeat(full) + '▱'.repeat(width - full);
}

/** Discord refuse une valeur de champ de plus de 1024 caractères. */
const FIELD_VALUE_LIMIT = 1024;

/**
 * Les lignes d'une valeur de champ, sans dépasser la limite de Discord : le surplus devient
 * « … et N autres » ; `footer`, s'il y en a un, est toujours gardé en dernière ligne.
 */
export function fitLines(lines: string[], footer?: string): string {
  const render = (shown: number) => {
    const hidden = lines.length - shown;
    return [
      ...lines.slice(0, shown),
      ...(hidden > 0 ? [`… et ${hidden} autre${hidden > 1 ? 's' : ''}`] : []),
      ...(footer ? [footer] : []),
    ].join('\n');
  };
  let shown = lines.length;
  while (shown > 0 && render(shown).length > FIELD_VALUE_LIMIT) shown -= 1;
  return render(shown);
}

const FREE_SLOT = '▫️ *libre*';

/** Les joueurs d'un rôle, un par ligne, puis les places libres. */
export const slotLines = (userIds: string[], count: number): string =>
  [
    ...userIds.map((id) => `<@${id}>`),
    ...Array.from({ length: Math.max(0, count - userIds.length) }, () => FREE_SLOT),
  ].join('\n');

/** Le nom d'un rôle sur l'embed : la place unique d'une mission, c'est « l'équipe ». */
const slotName = (role: Td2Role) => (role === 'PLAYER' ? 'Équipe' : TD2_SIGNUP_ROLE_LABELS[role]);

/** Le nom de l'activité (ou de la mission), seul, pour le titre de l'embed. */
const subjectName = (event: TitleView) =>
  event.mode?.activity.name ?? event.missionName ?? TD2_EVENT_KIND_LABELS.MISSION;

/** Le mode d'un raid, la difficulté d'une mission ; une incursion n'a ni l'un ni l'autre. */
function subjectDetail(event: TitleView): string | null {
  if (!event.mode) return event.difficulty ? TD2_DIFFICULTY_LABELS[event.difficulty] : null;
  return event.mode.activity.kind === 'RAID' ? event.mode.name : null;
}

/** L'en-tête : « ⚔️ RAID · MODE NORMAL », « 🎯 MISSION · HÉROÏQUE », ou l'état s'il y en a un. */
function eventHeader(event: TitleView, state?: string): string {
  const kind = event.mode ? event.mode.activity.kind : 'MISSION';
  const detail = subjectDetail(event);
  const parts = [
    `${KIND_ICONS[kind]} ${TD2_EVENT_KIND_LABELS[kind].toUpperCase()}`,
    state ?? (detail && `${event.mode ? 'MODE ' : ''}${detail.toUpperCase()}`),
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Un joueur de la réserve : sa place dans la file de son rôle, et le rôle quand il y en a plusieurs. */
const reserveLine = (
  event: Pick<EventView, 'signups'>,
  { userId, role }: { userId: string; role: Td2Role },
) =>
  `${reservePosition(event, userId)}. <@${userId}>${role === 'PLAYER' ? '' : ` · ${TD2_SIGNUP_ROLE_LABELS[role]}`}`;

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
  const date = time(event.scheduledAt, TimestampStyles.LongDateTime);
  const relative = time(event.scheduledAt, TimestampStyles.RelativeTime);
  const free = capacity - filled;
  const places =
    free > 0 ? `${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}` : 'complet';

  const lines = event.cancelledAt
    ? [`Prévue le ~~${date}~~`]
    : [
        started ? `### Commencée ${relative}` : `### ${date}`,
        started
          ? `-# organisée par <@${event.organizerId}>`
          : `-# ${relative} · organisée par <@${event.organizerId}>`,
        '',
        [
          `\`${progressBar(filled, capacity)}\` **${filled}/${capacity}**`,
          ...(started ? [] : [places]),
          ...(reserve.length > 0 ? [`${reserve.length} en réserve`] : []),
        ].join(' · '),
      ];

  // La couleur dit l'état : orange ouverte, or commencée, rouge annulée
  const color = event.cancelledAt ? COLORS.danger : started ? COLORS.soon : COLORS.primary;
  const state = event.cancelledAt ? 'ANNULÉE' : started ? 'EN COURS' : undefined;
  const name = subjectName(event);
  // Le rappel n'est promis que s'il est encore à venir : le planificateur n'en envoie pas
  // quand il reste 15 min ou moins avant le départ (packages/jobs/src/td2.ts)
  const reminderPending =
    !event.cancelledAt && event.scheduledAt.getTime() - now.getTime() > TD2_REMINDER_MS;
  const reminder = reminderPending
    ? ` · rappel ${TD2_REMINDER_MS / 60_000} min avant le départ`
    : '';
  const embed = baseEmbed(color)
    .setAuthor({ name: eventHeader(event, state) })
    .setTitle(event.cancelledAt ? `~~${name}~~` : name)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Sortie #${event.id}${reminder}` })
    .setTimestamp(event.scheduledAt);

  if (!event.cancelledAt) {
    embed.addFields(
      slots.map((slot) => {
        const players = confirmed(slot.role);
        const level = players.length >= slot.count ? 'complet' : `${players.length}/${slot.count}`;
        return {
          name: `${ROLE_EMOJIS[slot.role]} ${slotName(slot.role)} · ${level}`,
          value: slotLines(
            players.map((signup) => signup.userId),
            slot.count,
          ),
          inline: true,
        };
      }),
    );
    // Les directives d'une mission : ce qui corse la partie, une par ligne
    if (event.directives.length > 0) {
      embed.addFields({
        name: '🧩 Directives',
        value: event.directives.map((directive) => `• ${directive}`).join('\n'),
        inline: true,
      });
    }
    if (reserve.length > 0) {
      embed.addFields({
        name: '⏳ Réserve',
        value: fitLines(reserve.map((signup) => reserveLine(event, signup))),
      });
    }
  }

  // Annulée ou commencée : la liste reste lisible, mais on ne s'inscrit plus
  if (event.cancelledAt || started) return { embeds: [embed], components: [] };

  const roles = new ActionRowBuilder<ButtonBuilder>().addComponents(
    slots.map((slot) => {
      const count = confirmed(slot.role).length;
      const full = count >= slot.count;
      const isPlayer = slot.role === 'PLAYER';
      const label = isPlayer ? 'Rejoindre' : TD2_SIGNUP_ROLE_LABELS[slot.role];
      const counter = `${isPlayer ? ' · ' : ' '}${count}/${slot.count}`;
      return (
        new ButtonBuilder()
          .setCustomId(joinCustomId(event.id, slot.role))
          // Un rôle complet reste cliquable : le libellé dit qu'on y entre en réserve
          .setLabel(`${label}${full ? ' · réserve' : counter}`)
          .setEmoji(ROLE_EMOJIS[slot.role])
          .setStyle(full ? ButtonStyle.Secondary : ButtonStyle.Primary)
      );
    }),
  );
  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(leaveCustomId(event.id))
      .setLabel('Se désinscrire')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger),
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
  const { confirmed, reserve } = lineup(event);
  const slots = slotsInOrder(event);
  const capacity = slots.reduce((total, slot) => total + slot.count, 0);
  const team = slots.flatMap((slot) => confirmed(slot.role));
  const detail = subjectDetail(event);

  const embed = baseEmbed(COLORS.soon)
    .setAuthor({ name: '⏰ RAPPEL · DÉPART IMMINENT' })
    .setTitle(detail ? `${subjectName(event)} · ${detail}` : subjectName(event))
    .setDescription(`### Départ ${time(event.scheduledAt, TimestampStyles.RelativeTime)}`)
    .setFooter({ text: `Sortie #${event.id}` });
  if (team.length > 0) {
    embed.addFields({
      name: `${ROLE_EMOJIS.PLAYER} Équipe · ${team.length}/${capacity}`,
      value: team.map((signup) => `<@${signup.userId}>`).join('\n'),
      inline: true,
    });
  }
  if (reserve.length > 0) {
    embed.addFields({
      name: '⏳ Réserve',
      value: fitLines(
        reserve.map((signup) => reserveLine(event, signup)),
        '-# Prêt à monter si une place se libère',
      ),
      inline: true,
    });
  }
  // Un embed ne notifie personne : les mentions restent dans le contenu, en sous-texte
  return {
    ...notice(`-# ${mentions(everyone(event))}`, event.messageId, everyone(event)),
    embeds: [embed],
  };
}

/** Prévient ceux qui montent de la réserve. */
export function promotionMessage(
  event: EventView & { messageId: string | null },
  promotions: Td2Promotion[],
): MessageCreateOptions {
  const content = promotions
    .map(
      ({ userId, role }) =>
        `🎉 <@${userId}>, une place${role === 'PLAYER' ? '' : ` de ${TD2_SIGNUP_ROLE_LABELS[role]}`} s’est libérée : ` +
        `tu passes dans l’équipe de **${eventTitle(event)}** !`,
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

/**
 * Le menu des directives d'une mission : plusieurs choix, ou aucun. Celles déjà retenues sont
 * cochées. null sans directive active : Discord refuse un menu vide.
 */
export function directivesMenu(
  event: Pick<EventView, 'id' | 'directives'>,
  directives: Pick<Td2Directive, 'id' | 'name' | 'description'>[],
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const options = directives.slice(0, 25);
  if (options.length === 0) return null;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(directivesCustomId(event.id))
      .setPlaceholder('Directives : aucune')
      .setMinValues(0)
      .setMaxValues(options.length)
      .addOptions(
        options.map((directive) => ({
          label: directive.name.slice(0, 100),
          value: String(directive.id),
          ...(directive.description && { description: directive.description.slice(0, 100) }),
          default: event.directives.includes(directive.name),
        })),
      ),
  );
}

/** Le menu « Gérer », visible du seul organisateur ; une mission y règle aussi ses directives. */
export function manageMenu(
  event: Pick<EventView, 'id' | 'mode' | 'missionName' | 'difficulty' | 'directives'>,
  directives: Pick<Td2Directive, 'id' | 'name' | 'description'>[] = [],
) {
  const directiveRow = event.mode ? null : directivesMenu(event, directives);
  return {
    content: `Que veux-tu faire pour **${eventTitle(event)}** ?`,
    components: [
      ...(directiveRow ? [directiveRow] : []),
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
export function confirmCancelMenu(event: Pick<EventView, 'id'> & TitleView) {
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
