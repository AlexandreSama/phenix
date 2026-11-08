import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { buildLeaderboard } from '../leaderboard.js';

export const leaderboard: SlashCommand = {
  category: 'leveling',
  data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Affiche le classement XP du serveur')
      .setContexts(InteractionContextType.Guild)
      .addIntegerOption((option) =>
          option.setName('page').setDescription('La page à afficher').setMinValue(1),
      ),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const page = interaction.options.getInteger('page') ?? 1;
    await interaction.reply(await buildLeaderboard(interaction.guild, page, context));
  },
};