import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { baseEmbed, COLORS } from '../../../core/embeds.js';
import { blendNames, progressBar, shipScore, shipVerdict } from '../logic.js';

export const ship: SlashCommand = {
  category: 'fun',
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Calcule la compatibilité entre deux personnes')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName('premier').setDescription('Première personne').setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('second').setDescription('Seconde personne (toi par défaut)'),
    ),

  async execute(interaction) {
    const first = interaction.options.getUser('premier', true);
    const second = interaction.options.getUser('second') ?? interaction.user;
    const score = shipScore(first.id, second.id);

    const embed = baseEmbed(COLORS.fun)
      .setTitle(`💘 ${blendNames(first.displayName, second.displayName)}`)
      .setDescription(
        `${first} + ${second}\n\n${progressBar(score)} **${score} %**\n${shipVerdict(score)}`,
      );

    await interaction.reply({ embeds: [embed] });
  },
};
