import { touchTicketActivity } from '@phenix/database';
import type { Message } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { errorCode } from './error-code.js';

/** Une écriture au plus par salon et par durée : un salon bavard ne sollicite pas la base à chaque message. */
const WRITE_INTERVAL_MS = 60_000;

/**
 * La date du dernier message d'un membre parmi ceux lus dans le salon (ni bot, ni message
 * système) ; null s'il n'y en a pas. Second signal de la fermeture automatique, tiré de Discord :
 * il rattrape une activité que la base n'a pas vue (bot éteint, écriture perdue ou limitée).
 */
export function latestMemberMessageAt(
  messages: Iterable<Pick<Message, 'author' | 'system' | 'createdAt'>>,
): Date | null {
  let latest: Date | null = null;
  for (const message of messages) {
    if (message.author.bot || message.system) continue;
    if (latest === null || message.createdAt.getTime() > latest.getTime()) {
      latest = message.createdAt;
    }
  }
  return latest;
}

export interface ActivityOptions {
  /** Remplacés dans les tests : l'horloge et la table « salon → dernière écriture » */
  now?: () => number;
  writes?: Map<string, number>;
}

/**
 * Le délai d'inactivité d'un ticket repart à chaque message de membre dans son salon. Seul le
 * salon compte : le contenu du message, son auteur et ses pièces jointes ne sont jamais lus ni
 * gardés. Les bots, les messages système et les messages privés sont ignorés. Une erreur est
 * journalisée (code seulement) et jamais levée : un message ne doit pas faire tomber le bot.
 * Aucun intent supplémentaire : `GuildMessages` est déjà actif (XP de niveau).
 */
export function createActivityHandler(
  { db, logger }: Pick<BotContext, 'db' | 'logger'>,
  { now = Date.now, writes = new Map<string, number>() }: ActivityOptions = {},
) {
  let lastPurge = now();

  /** Une entrée plus vieille que l'intervalle ne limite plus rien : on l'oublie. */
  const purge = (current: number) => {
    if (current - lastPurge < WRITE_INTERVAL_MS) return;
    lastPurge = current;
    for (const [channelId, writtenAt] of writes) {
      if (current - writtenAt >= WRITE_INTERVAL_MS) writes.delete(channelId);
    }
  };

  return async (message: Message): Promise<void> => {
    if (!message.inGuild() || message.author.bot || message.system) return;

    const current = now();
    purge(current);
    const writtenAt = writes.get(message.channelId);
    if (writtenAt !== undefined && current - writtenAt < WRITE_INTERVAL_MS) return;
    // Avant l'écriture : deux messages simultanés ne font qu'une requête, et une base en panne
    // n'est pas sollicitée à chaque message
    writes.set(message.channelId, current);

    try {
      await touchTicketActivity(db, message.channelId);
    } catch (err) {
      logger.warn({ code: errorCode(err) }, 'Ticket activity not recorded');
    }
  };
}
