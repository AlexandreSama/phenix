import { findExpiredBans, liftSanction } from '@phenix/database';
import { DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { caseEmbed } from './case-format.js';
import { sendModLog } from './modlog.js';

/** Ban déjà levé à la main dans Discord : rien à lever, il suffit de clore la case. */
function isUnknownBan(err: unknown): boolean {
  return err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownBan;
}

/**
 * Lève les bans temporaires échus, sur les serveurs où se trouve le bot.
 * La base fait foi : un redémarrage ou une panne ne fait jamais oublier un ban.
 */
export async function liftExpiredBans(
  client: Client<true>,
  context: BotContext,
  now = new Date(),
): Promise<number> {
  const { db, logger } = context;
  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length === 0) return 0;

  const expired = await findExpiredBans(db, guildIds, now);
  let lifted = 0;

  for (const ban of expired) {
    const guild = client.guilds.cache.get(ban.guildId);
    if (!guild) continue;
    const reason = `Fin du bannissement temporaire (case #${ban.number})`;

    try {
      await guild.bans.remove(ban.targetId, reason);
    } catch (err) {
      if (!isUnknownBan(err)) {
        // Permission retirée, Discord indisponible… on réessaiera au prochain passage
        // Le code, pas l'erreur : l'adresse d'une DiscordAPIError contient l'identifiant du banni
        const code = err instanceof DiscordAPIError ? err.code : undefined;
        logger.warn({ guildId: guild.id, case: ban.number, code }, 'Temporary ban not lifted');
        continue;
      }
    }

    // Une seule transaction, la même que pour la levée depuis le site : si une autre levée est
    // passée avant (site, /unban), rien n'est refait et aucun débannissement n'est créé en double
    const { record } = await liftSanction(
      db,
      {
        guildId: guild.id,
        guildName: guild.name,
        targetId: ban.targetId,
        type: 'BAN',
        actorId: client.user.id,
        reason,
        via: 'SCHEDULE',
      },
      now,
    );
    if (!record) continue;
    await sendModLog(guild, caseEmbed(record), context);
    lifted++;
  }

  if (lifted > 0) logger.info({ lifted }, 'Bans temporaires levés');
  return lifted;
}

/** Vérifie les bans échus toutes les minutes. Renvoie la fonction qui arrête la boucle. */
export function startBanExpiry(
  client: Client<true>,
  context: BotContext,
  intervalMs = 60_000,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // un passage lent ne se superpose pas au suivant
    running = true;
    liftExpiredBans(client, context)
      .catch((err: unknown) => context.logger.error({ err }, 'Échec de la levée des bans'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
