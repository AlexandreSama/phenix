import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { baseEmbed, COLORS } from '../../../core/embeds.js';
import { pickAnswer } from '../logic.js';

export const eightBall: SlashCommand = {
  category: 'fun',
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Pose une question à la boule magique')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName('question').setDescription('Ta question').setRequired(true).setMaxLength(200),
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);

    const embed = baseEmbed(COLORS.fun)
      .setTitle('🎱 La boule magique')
      .addFields({ name: 'Question', value: question }, { name: 'Réponse', value: pickAnswer() });

    await interaction.reply({ embeds: [embed] });
  },
};
