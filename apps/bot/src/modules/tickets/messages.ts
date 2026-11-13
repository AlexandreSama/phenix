import type { Ticket, TicketPanel, TicketType } from '@phenix/database';
import { TICKET_RATING_MIN_COUNT, TICKET_RATING_WINDOW_DAYS } from '@phenix/shared';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  escapeMarkdown,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  time,
  TimestampStyles,
  type EmbedBuilder,
  type MessageCreateOptions,
} from 'discord.js';
import { buildCustomId } from '../../core/custom-id.js';
import { baseEmbed, COLORS } from '../../core/embeds.js';

/** Le bouton d'un type du panneau. Sans id (anciens panneaux déjà postés), `ticket:open` ouvre le premier type. */
export const openCustomId = (typeId: number) => buildCustomId('ticket', 'open', typeId);
/** Le menu de choix du panneau, quand il y a trop de types pour des boutons. */
export const CHOOSE_CUSTOM_ID = buildCustomId('ticket', 'choose');
/** Le formulaire d'un type : ses réponses reviennent avec le customId du type. */
export const formCustomId = (typeId: number) => buildCustomId('ticket', 'form', typeId);
export const closeCustomId = (ticketId: number) => buildCustomId('ticket', 'close', ticketId);
export const claimCustomId = (ticketId: number) => buildCustomId('ticket', 'claim', ticketId);
export const confirmCustomId = (ticketId: number) => buildCustomId('ticket', 'confirm', ticketId);
export const CANCEL_CUSTOM_ID = buildCustomId('ticket', 'cancel');
/** La note de satisfaction : le bouton n (1 à 5) du message privé envoyé à l'auteur. */
export const rateCustomId = (ticketId: number, rating: number) =>
  buildCustomId('ticket', 'rate', `${ticketId}:${rating}`);

/** Le plus grand identifiant d'une colonne `Int` de PostgreSQL. */
const MAX_TICKET_ID = 2_147_483_647;

/**
 * L'identifiant de ticket d'un customId, s'il est écrit exactement comme le bot l'écrit (entier
 * positif, sans zéro devant, dans les bornes d'un `Int`) ; sinon null : un customId peut être forgé.
 */
export function parseTicketId(id: string | undefined): number | null {
  if (!/^[1-9]\d*$/.test(id ?? '')) return null;
  const ticketId = Number(id);
  return ticketId <= MAX_TICKET_ID ? ticketId : null;
}

/** Délai entre la fermeture et la suppression du salon : le temps de lire le dernier message. */
export const DELETE_DELAY_MS = 5000;

/** Au-delà de 5 types, une rangée de boutons ne suffit plus : un menu en accepte 25. */
const MAX_BUTTONS = 5;
const MAX_MENU_OPTIONS = 25;
/** Discord limite le texte cumulé des embeds d'un message à 6000 caractères. */
const EMBEDS_TEXT_BUDGET = 6000;
const EMBED_TITLE_MAX = 256;
const EMBED_DESCRIPTION_MAX = 4096;
const NO_ANSWER = '*Pas de réponse*';

/**
 * Échappement d'un texte choisi par d'autres (nom de serveur, pseudo) : en plus du gras, de
 * l'italique, etc. (défauts de `escapeMarkdown`), titres, listes et liens masqués.
 */
export const STRICT_ESCAPE = {
  heading: true,
  maskedLink: true,
  bulletedList: true,
  numberedList: true,
} as const;

/** Coupe à `max` caractères au plus, avec « … » ; ne laisse jamais la moitié d'un emoji. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max - 1));
  const last = cut.charCodeAt(cut.length - 1);
  const isHighSurrogate = last >= 0xd800 && last <= 0xdbff;
  return `${isHighSurrogate ? cut.slice(0, -1) : cut}…`;
}

/** Ce que le panneau montre d'un type. */
export type PanelType = Pick<TicketType, 'id' | 'name' | 'description' | 'emoji'>;

/**
 * Le panneau « Ouvrir un ticket » : un bouton par type jusqu'à 5 types, puis un menu de choix
 * (jusqu'à 25). L'invite du menu est le « texte du bouton » réglé sur le site.
 */
export function ticketPanelMessage(
  panel: Pick<TicketPanel, 'title' | 'description' | 'buttonLabel'>,
  types: PanelType[],
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
} {
  const embed = baseEmbed().setTitle(panel.title);
  if (panel.description) embed.setDescription(panel.description);

  if (types.length <= MAX_BUTTONS) {
    const buttons = types.map((type) => {
      const button = new ButtonBuilder()
        .setCustomId(openCustomId(type.id))
        .setLabel(truncate(type.name, 80))
        .setStyle(ButtonStyle.Primary);
      return type.emoji ? button.setEmoji(type.emoji) : button;
    });
    return {
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)],
    };
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(CHOOSE_CUSTOM_ID)
    .setPlaceholder(truncate(panel.buttonLabel, 150))
    .addOptions(
      types.slice(0, MAX_MENU_OPTIONS).map((type) => {
        const option = new StringSelectMenuOptionBuilder()
          .setValue(String(type.id))
          .setLabel(truncate(type.name, 100));
        if (type.description) option.setDescription(truncate(type.description, 100));
        if (type.emoji) option.setEmoji(type.emoji);
        return option;
      }),
    );
  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  };
}

/**
 * Les boutons du message d'accueil : « Prendre en charge » (tant que personne ne l'a fait,
 * la prise en charge étant définitive) et « Fermer le ticket ».
 */
export function welcomeButtons(
  ticketId: number,
  { claimed }: { claimed: boolean },
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (!claimed) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(claimCustomId(ticketId))
        .setLabel('Prendre en charge')
        .setEmoji('🙋')
        .setStyle(ButtonStyle.Success),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(closeCustomId(ticketId))
      .setLabel('Fermer le ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}

/**
 * Le premier message du salon : il prévient l'auteur et l'équipe du type, nomme le type,
 * et porte les boutons « Prendre en charge » et « Fermer ». Seuls les rôles du type sont mentionnés.
 */
export function welcomeMessage(
  ticket: Pick<Ticket, 'id' | 'number' | 'ownerId'>,
  type: { name: string; staffRoleIds: string[] },
): MessageCreateOptions {
  const { staffRoleIds } = type;
  const staff = staffRoleIds.map((id) => `<@&${id}>`).join(' ');
  const embed = baseEmbed()
    .setTitle(`Ticket #${ticket.number}`)
    .setDescription(
      'Explique ta demande ici : un membre de l’équipe te répond dès que possible.\n' +
        'Quand c’est réglé, ferme le ticket avec le bouton ci-dessous.',
    )
    .addFields({ name: 'Type', value: truncate(type.name, 1024) });
  return {
    content: `<@${ticket.ownerId}> ${staff}`.trim(),
    embeds: [embed],
    components: welcomeButtons(ticket.id, { claimed: false }),
    // Ne notifie que l'auteur et les rôles du type, rien d'autre
    allowedMentions: { users: [ticket.ownerId], roles: staffRoleIds },
  };
}

/** Une réponse du formulaire ; `value` est null quand une question facultative est restée vide. */
export interface FormAnswer {
  label: string;
  value: string | null;
}

/**
 * Les réponses du formulaire, postées dans le salon (donc dans le transcript) : un embed par
 * réponse, sans aucune mention, et jamais plus de 6000 caractères au total.
 */
export function formAnswersMessage(answers: FormAnswer[]): {
  embeds: EmbedBuilder[];
  allowedMentions: { parse: [] };
} {
  let budget = EMBEDS_TEXT_BUDGET;
  const embeds: EmbedBuilder[] = [];
  for (const answer of answers) {
    const title = truncate(answer.label, EMBED_TITLE_MAX);
    // Plus de place pour le titre et au moins un caractère de réponse : on s'arrête là
    if (budget <= title.length) break;
    const description = truncate(
      answer.value ?? NO_ANSWER,
      Math.min(EMBED_DESCRIPTION_MAX, budget - title.length),
    );
    budget -= title.length + description.length;
    embeds.push(baseEmbed().setTitle(title).setDescription(description));
  }
  return { embeds, allowedMentions: { parse: [] } };
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

/**
 * Le message privé envoyé à l'auteur après la fermeture : cinq boutons de 1 à 5. Il dit ce qui est
 * fait de la note : enregistrée avec le ticket, montrée en moyennes seulement (par type avec
 * l'onglet Tickets, par membre de l'équipe aux seuls administrateurs du serveur).
 */
export function ratingMessage(
  ticket: Pick<Ticket, 'id' | 'number'>,
  guildName: string,
): { content: string; components: ActionRowBuilder<ButtonBuilder>[] } {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    [1, 2, 3, 4, 5].map((rating) =>
      new ButtonBuilder()
        .setCustomId(rateCustomId(ticket.id, rating))
        .setLabel(String(rating))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  // Le nom du serveur est choisi par ses admins : ni titre ni lien masqué dans un MP du bot
  const guild = escapeMarkdown(truncate(guildName, 100), STRICT_ESCAPE);
  return {
    content:
      `Ticket #${ticket.number} sur ${guild} fermé. Es-tu satisfait de l’aide reçue ? ` +
      'Note de 1 (pas du tout) à 5 (très satisfait).\n' +
      'Répondre est facultatif. Ta note est enregistrée avec ce ticket. Le tableau de bord du ' +
      'serveur ne montre jamais ta note seule, uniquement des moyennes : la moyenne par type de ' +
      'ticket à qui a accès à l’onglet Tickets, la moyenne par membre de l’équipe qui a pris en ' +
      'charge aux seuls administrateurs du serveur, chacune à partir de ' +
      `${TICKET_RATING_MIN_COUNT} notes. Sur un serveur avec peu de ` +
      'tickets, une moyenne peut laisser deviner une note. ' +
      `Tu as ${TICKET_RATING_WINDOW_DAYS} jours pour répondre.`,
    components: [row],
  };
}

/** Qui a fermé un ticket que personne n'a fermé : aucun identifiant de membre. */
export const AUTOMATIC_CLOSER_LABEL = 'Fermeture automatique';

export interface ClosedTicketLog {
  ticket: Pick<Ticket, 'id' | 'number' | 'ownerId' | 'guildId' | 'createdAt'>;
  /** null : fermeture automatique */
  closedById: string | null;
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
      {
        name: 'Fermé par',
        value: closedById ? `<@${closedById}>` : AUTOMATIC_CLOSER_LABEL,
        inline: true,
      },
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
