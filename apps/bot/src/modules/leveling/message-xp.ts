import { awardXp } from '@phenix/database';
import { effectiveXp, resolveXpPercents } from '@phenix/shared';
import type { Message } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { announceLevelUp } from './announce.js';
import { createCooldowns, levelingSettings, randomXp, type Cooldowns } from './xp.js';
import { isXpExcluded, type XpLocation } from './xp-rules.js';

/**
 * Donne de l'XP aux auteurs de messages, au plus une fois par délai.
 * Les bots, les webhooks et les messages système ne comptent pas.
 */
export function createMessageXpHandler(
  context: BotContext,
  cooldowns: Cooldowns = createCooldowns(),
  random: () => number = Math.random,
) {
  const { db, configs, xpRules, logger } = context;

  return async (message: Message): Promise<void> => {
    if (!message.inGuild() || message.author.bot || message.system) return;

    try {
      const settings = levelingSettings(await configs.get(message.guildId));
      if (!settings.xpEnabled) return;

      // Avant le délai : un message exclu ne doit pas retarder le prochain gain, ailleurs.
      const { channel } = message;
      const where: XpLocation = channel.isThread()
        ? {
            channelId: channel.id,
            parentChannelId: channel.parentId,
            categoryId: channel.parent?.parentId,
          }
        : { channelId: channel.id, categoryId: channel.parentId };
      if (isXpExcluded(settings.xpExcludedChannelIds, where)) return;

      const cooldownMs = settings.xpCooldownSec * 1000;
      if (!cooldowns.take(`${message.guildId}:${message.author.id}`, cooldownMs)) return;

      const member = message.member;
      const displayName = member?.displayName ?? message.author.displayName;
      const avatarUrl = (member ?? message.author).displayAvatarURL({
        extension: 'png',
        size: 128,
        forceStatic: true,
      });
      // Après le délai : la plupart des messages s'arrêtent avant, sans toucher au cache
      const { rolePercents, placePercent } = resolveXpPercents(
        await xpRules.getMultipliers(message.guildId),
        { ...where, roleIds: member ? [...member.roles.cache.keys()] : [] },
      );
      const amount = effectiveXp(randomXp(settings.xpMin, settings.xpMax, random), {
        rolePercents,
        placePercent,
        maxPercent: settings.xpMultiplierMaxPercent,
      });
      const result = await awardXp(db, {
        guildId: message.guildId,
        userId: message.author.id,
        amount,
        cooldownMs,
        displayName,
        avatarUrl,
      });

      if (result?.leveledUp) {
        await announceLevelUp(message, result.level, settings.levelUpChannelId, logger, {
          displayName,
          avatarUrl,
        });
      }
    } catch (err) {
      logger.error({ err, guildId: message.guildId }, "Échec du gain d'XP");
    }
  };
}
