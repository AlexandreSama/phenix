import {
  closeTicket,
  findTicket,
  findTicketType,
  touchTicketActivity,
  type Ticket,
} from '@phenix/database';
import {
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
} from 'discord.js';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ComponentHandler } from '../../core/command.js';
import type { BotContext } from '../../core/context.js';
import { canCloseTicket } from './access.js';
import { latestMemberMessageAt } from './activity.js';
import { errorCode } from './error-code.js';
import {
  AUTOMATIC_CLOSER_LABEL,
  closedTicketLog,
  confirmCloseMessage,
  DELETE_DELAY_MS,
  parseTicketId,
  type ClosedTicketLog,
} from './messages.js';
import { transcriptKey } from './permissions.js';
import { requestRating } from './rating.js';
import {
  fetchChannelMessages,
  renderTranscript,
  toTranscriptMessage,
  TRANSCRIPT_MAX_MESSAGES,
} from './transcript.js';

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

/**
 * Pas de note quand l'auteur ferme lui-même son ticket moins de 10 minutes après la prise en
 * charge : une note donnée si vite ne dit rien de l'aide reçue (décision de l'utilisateur).
 */
export const RATING_MIN_DELAY_AFTER_CLAIM_MS = 10 * 60 * 1000;

/** Vrai si l'auteur ferme un ticket pris en charge depuis moins de `RATING_MIN_DELAY_AFTER_CLAIM_MS`. */
function isRatingTooSoonAfterClaim(
  ticket: Pick<Ticket, 'ownerId' | 'claimedAt'>,
  closedById: string | null,
  closedAt: Date,
): boolean {
  if (closedById !== ticket.ownerId || !ticket.claimedAt) return false;
  return closedAt.getTime() - ticket.claimedAt.getTime() < RATING_MIN_DELAY_AFTER_CLAIM_MS;
}

/** Le ticket du bouton, s'il est encore ouvert et que ce membre a le droit de le fermer. */
async function closableTicket(
  interaction: CachedButton,
  id: string | undefined,
  { db }: BotContext,
): Promise<Ticket | string> {
  // Un customId peut être forgé : un identifiant mal écrit ne va jamais jusqu'à la base
  const ticketId = parseTicketId(id);
  const ticket = ticketId === null ? null : await findTicket(db, ticketId);
  if (
    !ticket ||
    ticket.guildId !== interaction.guildId ||
    ticket.channelId !== interaction.channelId ||
    ticket.status !== 'OPEN'
  ) {
    return CLOSE_REPLIES.stale;
  }
  // L'équipe est celle du type du ticket ; un ticket dont le type a disparu n'a plus d'équipe
  const type = ticket.typeId === null ? null : await findTicketType(db, ticket.typeId);
  // Défense en profondeur : l'équipe d'un type d'un autre serveur n'a aucun droit ici
  const staffRoleIds = type?.guildId === ticket.guildId ? type.staffRoleIds : [];
  return canCloseTicket(interaction.member, ticket, staffRoleIds) ? ticket : CLOSE_REPLIES.denied;
}

const ephemeral = (interaction: CachedButton, content: string) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral });

/** Poste le résumé dans le salon de logs des tickets, s'il y en a un. Un échec ne bloque pas la fermeture. */
async function postLog(guild: Guild, context: BotContext, log: ClosedTicketLog) {
  const settings = await context.configs.get(guild.id);
  const channel = settings?.ticketLogChannelId
    ? guild.channels.cache.get(settings.ticketLogChannelId)
    : undefined;
  if (!channel?.isSendable()) return;
  try {
    await channel.send(closedTicketLog(log));
  } catch (err) {
    context.logger.warn(
      { code: errorCode(err), guildId: guild.id },
      'Log du ticket impossible à poster',
    );
  }
}

/**
 * Fermeture refusée en base après l'écriture du transcript : l'objet ne doit pas rester dans
 * Garage sans référence (hors suppression et rétention). On le garde seulement si le ticket relu
 * le référence (déjà fermé par une fermeture concurrente : même clé `<guildId>/<numéro>`).
 * Ne lève jamais : un échec est journalisé avec son code.
 */
async function discardOrphanTranscript(ticketId: number, key: string, context: BotContext) {
  try {
    const fresh = await findTicket(context.db, ticketId);
    if (fresh?.transcriptKey === key) return;
    await context.transcripts.delete([key]);
  } catch (err) {
    context.logger.warn({ ticketId, code: errorCode(err) }, 'Orphan transcript not deleted');
  }
}

/** Qui ferme le ticket : de quoi l'écrire dans le transcript, le log et le salon. */
export interface TicketCloser {
  id: string;
  name: string;
  mention: string;
  tag: string;
}

export interface FinishTicketCloseInput {
  ticket: Ticket;
  guild: Guild;
  channel: GuildTextBasedChannel;
  client: Pick<Client, 'users'>;
  /** null : fermeture automatique faute d'activité (aucun identifiant de membre nulle part) */
  closedBy: TicketCloser | null;
  /** Fermeture automatique : la dernière activité lue ; si quelqu'un a écrit depuis, on ne ferme pas */
  expectedLastActivityAt?: Date;
  context: BotContext;
  options?: CloseOptions;
}

/**
 * `stale` : le ticket était déjà fermé (ou a changé, ou un membre a écrit) ; `storage_down` : le
 * ticket reste ouvert ; `too_long` : fermeture automatique abandonnée, le transcript serait tronqué.
 */
export type FinishTicketCloseResult = 'closed' | 'storage_down' | 'stale' | 'too_long';

/**
 * La fermeture, dans l'ordre : transcript dans Garage, ticket fermé en base, log, annonce, note de
 * satisfaction, puis suppression du salon. Si Garage ne répond pas, on s'arrête avant de toucher à
 * quoi que ce soit. Le verrou anti double fermeture est posé par l'appelant (`withTicketClosing`).
 * Fermeture automatique : on renonce, avant d'écrire quoi que ce soit, si un membre a écrit après
 * la dernière activité lue (second signal, tiré de Discord) ou si le transcript serait tronqué.
 */
export async function finishTicketClose({
  ticket,
  guild,
  channel,
  client,
  closedBy,
  expectedLastActivityAt,
  context,
  options: { wait = sleep, now = () => new Date() } = {},
}: FinishTicketCloseInput): Promise<FinishTicketCloseResult> {
  const { db, logger, transcripts } = context;

  const messages = await fetchChannelMessages(channel);
  if (expectedLastActivityAt) {
    // Un message de membre que la base n'a pas vu : le délai repart, rien n'est écrit dans Garage
    const latest = latestMemberMessageAt(messages);
    if (latest && latest.getTime() > expectedLastActivityAt.getTime()) {
      await touchTicketActivity(db, ticket.channelId, latest);
      return 'stale';
    }
  }
  // Limite atteinte : il manque peut-être des messages ; seul un membre peut fermer quand même
  if (closedBy === null && messages.length >= TRANSCRIPT_MAX_MESSAGES) return 'too_long';
  const closedAt = now();
  const settings = await context.configs.get(guild.id);
  const key = transcriptKey(ticket.guildId, ticket.number);
  const html = renderTranscript({
    guildName: guild.name,
    ticketNumber: ticket.number,
    ownerName: ticket.ownerName ?? ticket.ownerId,
    closedByName: closedBy?.name ?? AUTOMATIC_CLOSER_LABEL,
    openedAt: ticket.createdAt,
    closedAt,
    timeZone: settings?.timezone ?? 'Europe/Paris',
    messages: messages.map(toTranscriptMessage),
  });

  try {
    await transcripts.put(key, html, 'text/html; charset=utf-8');
  } catch (err) {
    logger.error(
      { ticketId: ticket.id, code: errorCode(err) },
      'Transcript impossible à enregistrer',
    );
    return 'storage_down';
  }

  const closed = await closeTicket(db, ticket.id, {
    closedById: closedBy?.id ?? null,
    closedByName: closedBy?.name ?? null,
    transcriptKey: key,
    messageCount: messages.length,
    closedVia: closedBy ? 'BUTTON' : 'INACTIVITY',
    ...(expectedLastActivityAt && { expectedLastActivityAt }),
    now: closedAt,
  });
  if (!closed) {
    await discardOrphanTranscript(ticket.id, key, context);
    return 'stale';
  }
  logger.info({ guildId: ticket.guildId, number: ticket.number }, 'Ticket fermé');

  await postLog(guild, context, {
    ticket,
    closedById: closedBy?.id ?? null,
    closedAt,
    messageCount: messages.length,
    publicUrl: context.publicUrl,
  });

  // Le ticket est déjà fermé en base : une annonce impossible à poster ne doit pas laisser le salon
  // en plan, sans note ni suppression
  try {
    await channel.send({
      content: `🔒 Ticket fermé ${closedBy ? `par ${closedBy.mention}` : 'automatiquement faute d’activité'}. Ce salon sera supprimé dans ${DELETE_DELAY_MS / 1000} secondes.`,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    logger.warn({ channelId: channel.id, code: errorCode(err) }, 'Closing announcement not posted');
  }

  // Fermeture réussie : on demande sa note à l'auteur (y compris s'il a fermé lui-même), sauf s'il
  // ferme juste après la prise en charge (note de complaisance ou de représailles), et sauf
  // fermeture automatique (contact non sollicité pour un ticket abandonné, note qui fausserait la
  // moyenne). `ticket` vient d'être relu en base au clic sur « Fermer » : `claimedAt` est à jour.
  // Un échec du message privé ne bloque jamais la suite.
  if (closedBy === null) {
    logger.info('Rating not requested: automatic close');
  } else if (isRatingTooSoonAfterClaim(ticket, closedBy.id, closedAt)) {
    logger.info('Rating not requested: owner closed the ticket shortly after it was claimed');
  } else {
    await requestRating(client, ticket, guild.name, logger);
  }

  await wait(DELETE_DELAY_MS);
  try {
    await channel.delete(
      `Ticket #${ticket.number} fermé ${closedBy ? `par ${closedBy.tag}` : 'automatiquement'}`,
    );
  } catch (err) {
    logger.warn(
      { channelId: channel.id, code: errorCode(err) },
      'Salon du ticket impossible à supprimer',
    );
    await channel
      .send("Je n'ai pas pu supprimer ce salon : un admin peut le faire à la main.")
      .catch(() => undefined);
  }
  return 'closed';
}

/** Les tickets dont la fermeture est en cours : le bouton et la fermeture automatique s'y arrêtent. */
const closingTickets = new Set<number>();

/**
 * Une seule fermeture à la fois par ticket (deux membres qui confirment en même temps, ou le
 * bouton pendant le passage automatique). Renvoie `busy` sans rien faire si elle est déjà en cours.
 */
export async function withTicketClosing<T>(
  ticketId: number,
  close: () => Promise<T>,
): Promise<T | 'busy'> {
  if (closingTickets.has(ticketId)) return 'busy';
  closingTickets.add(ticketId);
  try {
    return await close();
  } finally {
    closingTickets.delete(ticketId);
  }
}

/** Le bouton « Fermer » confirmé : répond à l'interaction, puis fait la fermeture. */
async function closeTicketChannel(
  interaction: CachedButton,
  ticket: Ticket,
  context: BotContext,
  options: CloseOptions,
) {
  const member = interaction.member;
  await interaction.update({ content: CLOSE_REPLIES.working, components: [] });

  const result = await finishTicketClose({
    ticket,
    guild: interaction.guild,
    channel: interaction.channel as GuildTextBasedChannel,
    client: interaction.client,
    closedBy: {
      id: member.id,
      name: member.displayName,
      mention: String(member),
      tag: member.user.tag,
    },
    context,
    options,
  });
  if (result === 'storage_down') await interaction.editReply(CLOSE_REPLIES.storageDown);
  if (result === 'stale') await interaction.editReply(CLOSE_REPLIES.stale);
}

/** Les trois boutons de fermeture : « Fermer le ticket », puis « Fermer » ou « Annuler ». */
export function createCloseTicketButtons(options: CloseOptions = {}): ComponentHandler[] {
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
      // Deux membres de l'équipe qui confirment en même temps : une seule fermeture
      const outcome = await withTicketClosing(ticket.id, () =>
        closeTicketChannel(interaction, ticket, context, options),
      );
      if (outcome === 'busy') {
        await interaction.update({ content: CLOSE_REPLIES.inProgress, components: [] });
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
