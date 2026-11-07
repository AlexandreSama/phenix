import { InteractionContextType, SlashCommandBuilder, time, TimestampStyles } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { baseEmbed } from '../../../core/embeds.js';

export const serverinfos: SlashCommand = {
  category: 'utils',
  data: new SlashCommandBuilder()
    .setName('serverinfos')
    .setDescription('Affiche les informations du serveur')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const { guild } = interaction;

    const embed = baseEmbed()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: 'Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Membres', value: `${guild.memberCount}`, inline: true },
        { name: 'Créé', value: time(guild.createdAt, TimestampStyles.LongDate), inline: true },
        { name: 'Salons', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Rôles', value: `${guild.roles.cache.size - 1}`, inline: true },
        {
          name: 'Boosts',
          value: `${guild.premiumSubscriptionCount ?? 0} (niveau ${guild.premiumTier})`,
          inline: true,
        },
      )
      .setFooter({ text: `ID : ${guild.id}` });

    await interaction.reply({ embeds: [embed] });
  },
};
