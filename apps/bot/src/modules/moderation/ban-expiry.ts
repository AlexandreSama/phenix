import { findActiveCases, findExpiredBans, liftSanction, type Case } from '@phenix/database';
import { LockBusyError, LockUnavailableError, moderationLockKey } from '@phenix/jobs';
import { DiscordAPIError, RESTJSONErrorCodes, type Client, type Guild } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { caseEmbed } from './case-format.js';
import { sendModLog } from './modlog.js';

/** Ban déjà levé à la main dans Discord : rien à lever, il suffit de clore la case. */
function isUnknownBan(err: unknown): boolean {
  return err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownBan;
}

/**
 * Le ban vu échu l'est-il toujours, d'après les bans actifs relus sous verrou ? Il doit en faire
 * encore partie, et aucun ban actif ne doit courir au-delà de `now` (ban plus récent ou définitif) :
 * dans le doute, on ne débannit pas. À l'échéance exacte, le ban est dû (comme le `lte` de
 * `findExpiredBans`).
 */
export function isBanStillDue(
  activeBans: readonly Pick<Case, 'number' | 'expiresAt'>[],
  ban: Pick<Case, 'number'>,
  now: Date,
): boolean {
  return (
    activeBans.some((active) => active.number === ban.number) &&
    activeBans.every((active) => active.expiresAt !== null && active.expiresAt <= now)
  );
}

/**
 * Lève les bans temporaires échus, sur les serveurs où se trouve le bot.
 * La base fait foi : un redémarrage ou une panne ne fait jamais oublier un ban.
 * Chaque levée se fait sous le verrou du membre, après relecture de ses bans actifs : un /ban qui
 * prolonge la sanction au même moment n'est pas défait.
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

    let lockKey: string;
    try {
      lockKey = moderationLockKey(guild.id, ban.targetId);
    } catch {
      // Ligne corrompue (identifiant qui n'est pas un snowflake) : ce ban seul est écarté, pour ne
      // pas bloquer à chaque passage tous les autres. Ni l'erreur ni la cible au log (l'identifiant)
      logger.warn(
        { guildId: guild.id, case: ban.number },
        'Temporary ban skipped: invalid member identifier',
      );
      continue;
    }

    let record: Case | null;
    try {
      record = await context.locks.withLock(lockKey, () =>
        liftBan(client, guild, ban, context, now),
      );
    } catch (err) {
      // Ces deux erreurs viennent de la prise du verrou : rien n'a été tenté pour ce ban
      if (err instanceof LockBusyError) {
        // Une commande ou le site agit sur ce membre : ce ban sera repris au passage suivant
        logger.info(
          { guildId: guild.id, case: ban.number },
          'Temporary ban skipped: member locked',
        );
        continue;
      }
      if (err instanceof LockUnavailableError) {
        // Décision : sans verrou, on ne lève rien (sens sûr) ; le passage suivant réessaiera.
        // Ni l'erreur ni la cible au log : la clé du verrou contient l'identifiant du banni
        logger.warn(
          { guildId: guild.id, case: ban.number },
          'Moderation lock unavailable: temporary bans not lifted',
        );
        break;
      }
      throw err;
    }
    if (!record) continue;
    await sendModLog(guild, caseEmbed(record), context);
    lifted++;
  }

  if (lifted > 0) logger.info({ lifted }, 'Bans temporaires levés');
  return lifted;
}

/**
 * Lève un ban échu, verrou du membre tenu : relit ses bans actifs, puis lève dans Discord et dans la
 * base. Renvoie le débannissement créé, ou null si rien n'a été levé.
 */
async function liftBan(
  client: Client<true>,
  guild: Guild,
  ban: Case,
  context: BotContext,
  now: Date,
): Promise<Case | null> {
  const { db, logger } = context;
  const activeBans = await findActiveCases(db, guild.id, ban.targetId, 'BAN', now);
  // Déjà levé, ou prolongé par un /ban concurrent : ni Discord ni la base ne sont touchés
  if (!isBanStillDue(activeBans, ban, now)) return null;

  const reason = `Fin du bannissement temporaire (case #${ban.number})`;
  try {
    await guild.bans.remove(ban.targetId, reason);
  } catch (err) {
    if (!isUnknownBan(err)) {
      // Permission retirée, Discord indisponible… on réessaiera au prochain passage
      // Le code, pas l'erreur : l'adresse d'une DiscordAPIError contient l'identifiant du banni
      const code = err instanceof DiscordAPIError ? err.code : undefined;
      logger.warn({ guildId: guild.id, case: ban.number, code }, 'Temporary ban not lifted');
      return null;
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
  return record;
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
