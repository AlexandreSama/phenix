import type { Message } from 'discord.js';
import type { Logger } from '../../logger.js';

export function levelUpText(userId: string, level: number): string {
  return `🔥 <@${userId}> passe au **niveau ${level}** !`;
}

/**
 * Annonce un passage de niveau dans le salon choisi sur le site, sinon là où le membre a écrit.
 * Une annonce ratée (salon supprimé, permission retirée) ne fait jamais perdre l'XP.
 */
export async function announceLevelUp(
  message: Message<true>,
  level: number,
  channelId: string | null,
  logger: Pick<Logger, 'warn'>,
): Promise<void> {
  const configured = channelId ? message.guild.channels.cache.get(channelId) : undefined;
  const channel = configured?.isSendable() ? configured : message.channel;

  try {
    await channel.send({
      content: levelUpText(message.author.id, level),
      // La mention notifie le membre, et lui seul
      allowedMentions: { users: [message.author.id] },
    });
  } catch (err) {
    logger.warn(
      { err, guildId: message.guildId, channelId: channel.id },
      'Annonce de niveau ratée',
    );
  }
}
