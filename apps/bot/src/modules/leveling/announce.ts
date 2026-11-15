import { DiscordAPIError, RESTJSONErrorCodes, type Message } from 'discord.js';
import type { Logger } from '../../logger.js';
import { levelUpReply, type LevelCardDeps } from './level-card.js';

/** Données nécessaires au dessin de la carte de passage de niveau. */
export interface LevelUpCardData {
  displayName: string;
  avatarUrl: string;
}

const isMissingPermissions = (err: unknown): boolean =>
  err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.MissingPermissions;

export function levelUpText(userId: string, level: number): string {
  return `🔥 <@${userId}> passe au **niveau ${level}** !`;
}

/**
 * Annonce un passage de niveau dans le salon choisi sur le site, sinon là où le membre a écrit.
 * Avec les données de la carte, l'annonce comporte une image ; si ce message est refusé (ex. pas
 * de permission de joindre des fichiers : 50013), on réessaie en texte seul. Toute autre erreur
 * (réseau, délai) ne déclenche pas de second envoi : Discord a pu publier le premier, le membre
 * serait notifié deux fois. Une annonce ratée (salon supprimé, permission retirée) ne fait jamais
 * perdre l'XP.
 */
export async function announceLevelUp(
  message: Message<true>,
  level: number,
  channelId: string | null,
  logger: Pick<Logger, 'warn'>,
  extra?: LevelUpCardData,
  deps: LevelCardDeps = {},
): Promise<void> {
  const configured = channelId ? message.guild.channels.cache.get(channelId) : undefined;
  const channel = configured?.isSendable() ? configured : message.channel;
  const base = {
    content: levelUpText(message.author.id, level),
    allowedMentions: { users: [message.author.id] },
  };
  const context = { guildId: message.guildId, channelId: channel.id };

  try {
    if (extra) {
      try {
        const reply = await levelUpReply({ ...extra, level }, { logger, ...deps });
        await channel.send({ ...base, ...reply });
        return;
      } catch (err) {
        if (!isMissingPermissions(err)) throw err;
        logger.warn({ err, ...context }, 'Annonce de niveau avec carte ratée, repli sur le texte');
      }
    }
    await channel.send(base);
  } catch (err) {
    logger.warn({ err, ...context }, 'Annonce de niveau ratée');
  }
}
