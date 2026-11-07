import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { baseEmbed } from '../../../core/embeds.js';

export const avatar: SlashCommand = {
  category: 'fun',
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Affiche l'avatar d'un membre en grand")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Le membre (toi par défaut)'),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('membre') ?? interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });

    const embed = baseEmbed().setTitle(`Avatar de ${user.displayName}`).setURL(url).setImage(url);

    await interaction.reply({ embeds: [embed] });
  },
};
