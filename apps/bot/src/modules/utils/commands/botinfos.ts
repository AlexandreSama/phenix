import {
  InteractionContextType,
  SlashCommandBuilder,
  version as discordJsVersion,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { baseEmbed } from '../../../core/embeds.js';
import { formatDuration, formatMegabytes } from '../../../core/format.js';

export const botinfos: SlashCommand = {
  category: 'utils',
  data: new SlashCommandBuilder()
    .setName('botinfos')
    .setDescription('Affiche les informations du bot')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { client } = interaction;

    const embed = baseEmbed()
      .setTitle(client.user.username)
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: 'Serveurs', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'En ligne depuis', value: formatDuration(client.uptime), inline: true },
        { name: 'Mémoire', value: formatMegabytes(process.memoryUsage().rss), inline: true },
        { name: 'Versions', value: `Node ${process.version} · discord.js ${discordJsVersion}` },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
