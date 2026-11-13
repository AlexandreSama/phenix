import {
  closeTicket,
  findInactivityCandidates,
  findTicket,
  markTicketInactivityFailed,
  markTicketInactivityReminded,
  touchTicketActivity,
  type InactivityCandidate,
} from '@phenix/database';
import type { TicketJob } from '@phenix/jobs';
import {
  RESTJSONErrorCodes,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { isDiscordError } from '../../core/publish.js';
import { latestMemberMessageAt } from './activity.js';
import { finishTicketClose, withTicketClosing, type CloseOptions } from './close.js';
import { errorCode } from './error-code.js';
import { DELETED_BY_HAND } from './lifecycle.js';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** Les tickets dus lus à chaque passage, du plus anciennement actif au plus récent. */
const CANDIDATE_LIMIT = 200;

/** Au plus ce nombre par serveur et par passage : un serveur ne monopolise pas le passage. */
const CANDIDATE_LIMIT_PER_GUILD = 25;

/** Les derniers messages lus avant un rappel, pour y chercher une activité que la base n'a pas vue. */
const REMINDER_RECENT_MESSAGES = 20;

/**
 * Au plus ce nombre de fermetures (avec transcript) par passage : le reste attend le passage
 * suivant, 5 minutes plus tard. Un échec de Garage compte aussi : une panne ne lance pas des
 * centaines de transcripts.
 */
export const MAX_CLOSES_PER_PASS = 10;

export type InactivityDecision = 'none' | 'remind' | 'close';

export interface InactivityState {
  lastActivityAt: Date;
  inactivityRemindedAt: Date | null;
  /** Le délai du type du ticket ; null : fermeture automatique désactivée */
  inactivityHours: number | null;
}

/**
 * Ce qu'il faut faire d'un ticket ouvert, sans effet de bord. Délai D (en heures) :
 * - délai absent ou invalide : rien (désactivé) ;
 * - pas de rappel posté : rappel dès D/2 sans activité (moitié exacte incluse), JAMAIS de fermeture,
 *   même après une longue panne du bot : on rappelle d'abord ;
 * - rappel posté : fermeture seulement si D/2 s'est écoulée depuis le rappel ET D depuis la dernière
 *   activité (échéance exacte incluse) ; un rappel antérieur à la dernière activité est incohérent
 *   (une activité efface le rappel) : rien, on reste du côté sûr.
 */
export function inactivityDecision(
  { lastActivityAt, inactivityRemindedAt, inactivityHours }: InactivityState,
  now: Date,
): InactivityDecision {
  if (inactivityHours === null || !Number.isFinite(inactivityHours) || inactivityHours <= 0) {
    return 'none';
  }
  const delayMs = inactivityHours * HOUR_MS;
  const halfMs = delayMs / 2;
  const sinceActivity = now.getTime() - lastActivityAt.getTime();

  if (inactivityRemindedAt === null) return sinceActivity >= halfMs ? 'remind' : 'none';
  if (inactivityRemindedAt.getTime() < lastActivityAt.getTime()) return 'none';
  const sinceReminder = now.getTime() - inactivityRemindedAt.getTime();
  return sinceReminder >= halfMs && sinceActivity >= delayMs ? 'close' : 'none';
}

const plural = (count: number, unit: string) => `${count} ${unit}${count > 1 ? 's' : ''}`;

/** « 6 heures », « 1 jour et 12 heures » : le temps restant écrit pour un humain. */
function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / MINUTE_MS);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    days > 0 ? plural(days, 'jour') : null,
    hours > 0 ? plural(hours, 'heure') : null,
    minutes > 0 ? plural(minutes, 'minute') : null,
  ].filter((part) => part !== null);
  if (parts.length === 0) return 'moins d’une minute';
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : parts[0]!;
}

/**
 * Le rappel posté dans le salon : il mentionne l'auteur (et personne d'autre) et annonce la
 * fermeture D/2 plus tard, ce que garantit `inactivityDecision` même si le rappel part en retard.
 */
export function inactivityReminder(ownerId: string, inactivityHours: number) {
  return {
    content:
      `<@${ownerId}> ⏰ Ce ticket sera fermé automatiquement s’il reste sans nouveau message ` +
      `d’ici ${formatDuration((inactivityHours * HOUR_MS) / 2)}.`,
    allowedMentions: { users: [ownerId] },
  };
}

export interface InactivityContext {
  client: Pick<Client, 'channels' | 'users'>;
  context: BotContext;
  /** Remplacés dans les tests : l'horloge et les attentes de la fermeture */
  now?: () => Date;
  closeOptions?: CloseOptions;
}

interface InactivityCounts {
  reminded: number;
  closed: number;
  failed: number;
  /** Une action était due mais n'a pas eu lieu, sans erreur : activité entre-temps, fermeture déjà en cours, plafond atteint */
  skipped: number;
}

type TicketChannel = GuildTextBasedChannel & { guild: Guild };

/** Le salon du ticket ; `missing` s'il n'existe plus (10003) ; une autre erreur remonte. */
async function findTicketChannel(
  client: InactivityContext['client'],
  candidate: InactivityCandidate,
): Promise<TicketChannel | 'missing'> {
  let channel;
  try {
    channel = await client.channels.fetch(candidate.channelId);
  } catch (err) {
    if (isDiscordError(err, RESTJSONErrorCodes.UnknownChannel)) return 'missing';
    throw err;
  }
  if (!channel) return 'missing';
  // Défense en profondeur : seul un salon de texte du serveur du ticket est touché
  if (!channel.isTextBased() || channel.isDMBased() || channel.guildId !== candidate.guildId) {
    throw new TypeError('Ticket channel is not a text channel of the ticket guild');
  }
  return channel;
}

/**
 * Un passage de la fermeture automatique : pour chaque ticket ouvert dû dont le type a un délai
 * d'inactivité, rappel à mi-délai puis fermeture avec transcript. Conçu pour agir sur des
 * personnes avec prudence : rien sans rappel préalable, rien si quelqu'un a écrit entre la lecture
 * et l'action (conditions en base, puis second signal : les derniers messages lus dans Discord),
 * au plus `MAX_CLOSES_PER_PASS` fermetures, chaque ticket isolé des autres et mis en recul après
 * un échec. Journal : un log `info` par action (rappel posté, ticket fermé) avec le ticket, la
 * décision et le délai, puis un log `info` de nombres par passage ; jamais de pseudo, d'identifiant
 * de membre ni de nom de salon. Un nom de tâche inconnu ou une date invalide sont ignorés ; la date
 * de la tâche est bornée à « maintenant » comme pour la purge des sanctions (une tâche injectée
 * dans le futur n'avance aucune échéance).
 */
export async function processInactivity(job: TicketJob, ctx: InactivityContext): Promise<void> {
  const { client, context, now: clock = () => new Date(), closeOptions } = ctx;
  const { db, logger } = context;
  // le nom vient de Valkey (simple transtypage) : seule `inactivity` agit
  const name: string = job.name;
  if (name !== 'inactivity') {
    logger.warn({ job: name }, 'Unknown ticket job ignored');
    return;
  }
  if (!Number.isFinite(job.scheduledAt.getTime())) {
    logger.warn({ job: name }, 'Ticket job with invalid date ignored');
    return;
  }
  const now = clock();
  const reference = job.scheduledAt.getTime() > now.getTime() ? now : job.scheduledAt;

  const counts: InactivityCounts = { reminded: 0, closed: 0, failed: 0, skipped: 0 };
  let closeAttempts = 0;
  let due = 0;

  /** La trace d'une action sur un ticket : de quoi la retrouver, sans donnée personnelle. */
  const logDecision = (candidate: InactivityCandidate, decision: string, message: string) =>
    logger.info(
      { ticketId: candidate.id, decision, inactivityHours: candidate.type.inactivityHours },
      message,
    );

  const closeDeleted = async (candidate: InactivityCandidate) => {
    const done = await closeTicket(db, candidate.id, DELETED_BY_HAND);
    counts[done ? 'closed' : 'skipped']++;
    if (done) logDecision(candidate, 'channel_deleted', 'Ticket closed: channel gone');
  };

  const remind = async (candidate: InactivityCandidate, channel: TicketChannel) => {
    // Second signal : un message de membre plus récent que l'activité en base (bot éteint,
    // écriture perdue ou limitée) recale l'activité au lieu de rappeler
    const recent = await channel.messages.fetch({ limit: REMINDER_RECENT_MESSAGES });
    const latest = latestMemberMessageAt(recent.values());
    if (latest && latest.getTime() > candidate.lastActivityAt.getTime()) {
      await touchTicketActivity(db, candidate.channelId, latest);
      counts.skipped++;
      return;
    }
    // D'abord le message : s'il échoue, rien n'est marqué et le prochain passage réessaie
    await channel.send(inactivityReminder(candidate.ownerId, candidate.type.inactivityHours ?? 0));
    const marked = await markTicketInactivityReminded(
      db,
      candidate.id,
      candidate.lastActivityAt,
      now,
    );
    counts[marked ? 'reminded' : 'skipped']++;
    if (marked) logDecision(candidate, 'remind', 'Ticket inactivity reminder posted');
  };

  /** Un échec : le ticket sort des candidats pendant 1 h ; ce marquage ne fait rien tomber. */
  const markFailed = async (candidate: InactivityCandidate) => {
    counts.failed++;
    try {
      await markTicketInactivityFailed(db, candidate.id, now);
    } catch (err) {
      logger.warn(
        { ticketId: candidate.id, code: errorCode(err) },
        'Ticket inactivity failure not recorded',
      );
    }
  };

  const closeAutomatically = async (candidate: InactivityCandidate, channel: TicketChannel) => {
    const result = await withTicketClosing(candidate.id, async () => {
      // Le ticket entier (nom de l'auteur, numéro…) ; une activité depuis la liste suffit à renoncer
      const ticket = await findTicket(db, candidate.id);
      if (
        ticket?.status !== 'OPEN' ||
        ticket.lastActivityAt.getTime() !== candidate.lastActivityAt.getTime()
      ) {
        return 'stale' as const;
      }
      return finishTicketClose({
        ticket,
        guild: channel.guild,
        channel,
        client,
        closedBy: null,
        expectedLastActivityAt: candidate.lastActivityAt,
        context,
        options: closeOptions,
      });
    });
    if (result === 'closed') {
      counts.closed++;
      logDecision(candidate, 'close', 'Ticket closed automatically');
    } else if (result === 'storage_down') {
      await markFailed(candidate);
    } else {
      counts.skipped++;
      if (result === 'too_long') {
        logger.warn(
          { ticketId: candidate.id },
          'Ticket transcript limit reached: automatic close skipped',
        );
      }
    }
  };

  const candidates = await findInactivityCandidates(db, {
    now: reference,
    limit: CANDIDATE_LIMIT,
    perGuildLimit: CANDIDATE_LIMIT_PER_GUILD,
  });
  for (const candidate of candidates) {
    try {
      const decision = inactivityDecision(
        { ...candidate, inactivityHours: candidate.type.inactivityHours },
        reference,
      );
      if (decision === 'none') continue;
      due++;
      if (decision === 'close' && closeAttempts >= MAX_CLOSES_PER_PASS) {
        counts.skipped++;
        continue;
      }
      const channel = await findTicketChannel(client, candidate);
      if (channel === 'missing') {
        await closeDeleted(candidate);
      } else if (decision === 'remind') {
        await remind(candidate, channel);
      } else {
        closeAttempts++;
        await closeAutomatically(candidate, channel);
      }
    } catch (err) {
      logger.warn(
        { ticketId: candidate.id, code: errorCode(err) },
        'Ticket inactivity step failed',
      );
      await markFailed(candidate);
    }
  }

  if (counts.reminded + counts.closed + counts.failed + counts.skipped === 0) {
    logger.debug('Ticket inactivity pass: nothing to do');
    return;
  }
  logger.info({ candidates: candidates.length, due, ...counts }, 'Ticket inactivity pass done');
}

/** Le processeur de la file `tickets`, branché sur le worker dans `index.ts`. */
export function createTicketProcessor(ctx: InactivityContext) {
  return (job: TicketJob): Promise<void> => processInactivity(job, ctx);
}
