import { awardXp } from '@phenix/database';
import type { Message } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { announceLevelUp } from './announce.js';
import { createCooldowns, levelingSettings, randomXp, type Cooldowns } from './xp.js';

/**
 * Donne de l'XP aux auteurs de messages, au plus une fois par délai.
 * Les bots, les webhooks et les messages système ne comptent pas.
 */
export function createMessageXpHandler(
    context: BotContext,
    cooldowns: Cooldowns = createCooldowns(),
    random: () => number = Math.random,
) {
  const { db, configs, logger } = context;

  return async (message: Message): Promise<void> => {
    if (!message.inGuild() || message.author.bot || message.system) return;

    try {
      const settings = levelingSettings(await configs.get(message.guildId));
      if (!settings.xpEnabled) return;

      const cooldownMs = settings.xpCooldownSec * 1000;
      if (!cooldowns.take(`${message.guildId}:${message.author.id}`, cooldownMs)) return;

      const member = message.member;
      const result = await awardXp(db, {
        guildId: message.guildId,
        userId: message.author.id,
        amount: randomXp(settings.xpMin, settings.xpMax, random),
        cooldownMs,
        displayName: member?.displayName ?? message.author.displayName,
        avatarUrl: (member ?? message.author).displayAvatarURL({ extension: 'png', size: 128 }),
      });

      if (result?.leveledUp) {
        await announceLevelUp(message, result.level, settings.levelUpChannelId, logger);
      }
    } catch (err) {
      logger.error({ err, guildId: message.guildId }, "Échec du gain d'XP");
    }
  };
}