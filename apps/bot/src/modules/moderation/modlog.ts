import type { EmbedBuilder, Guild, User } from 'discord.js';
import type { BotContext } from '../../core/context.js';
import { baseEmbed, COLORS } from '../../core/embeds.js';

/**
 * Publie dans le salon de logs du serveur, s'il est configuré.
 * N'échoue jamais : un log raté ne doit pas faire croire que la sanction a échoué.
 */
export async function sendModLog(
  guild: Guild,
  embed: EmbedBuilder,
  { configs, logger }: Pick<BotContext, 'configs' | 'logger'>,
): Promise<void> {
  try {
    const config = await configs.get(guild.id);
    if (!config?.modLogChannelId) return;

    const channel = guild.channels.cache.get(config.modLogChannelId);
    if (!channel?.isSendable()) {
      logger.warn({ guildId: guild.id }, 'Salon de logs introuvable ou non textuel');
      return;
    }
    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "Échec de l'envoi dans le salon de logs");
  }
}

/** Embed de log pour une action sans case : /clear, /lock, /clearwarn. Le modérateur : un membre, ou sa mention. */
export function actionEmbed(
  title: string,
  moderator: User | string,
  details: string,
): EmbedBuilder {
  return baseEmbed(COLORS.primary)
    .setTitle(title)
    .setDescription(details)
    .addFields({ name: 'Modérateur', value: `${moderator}` })
    .setTimestamp();
}
