import { getMemberRank } from '@phenix/database';
import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { rankEmbed } from '../rank-card.js';

export const rank: SlashCommand = {
  category: 'leveling',
  data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription("Affiche le niveau et l'XP d'un membre")
      .setContexts(InteractionContextType.Guild)
      .addUserOption((option) =>
          option.setName('membre').setDescription('Le membre (toi par défaut)').setRequired(false),
      ),

  async execute(interaction, { db }) {
    if (!interaction.inCachedGuild()) return;
    const user = interaction.options.getUser('membre') ?? interaction.user;
    const member = interaction.options.getMember('membre') ?? interaction.member;

    if (user.bot) {
      await interaction.reply({
        content: "Les bots ne gagnent pas d'XP.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const memberRank = await getMemberRank(db, interaction.guildId, user.id);
    if (!memberRank) {
      const who = user.id === interaction.user.id ? "Tu n'as" : `${user} n'a`;
      await interaction.reply({
        content: `${who} pas encore gagné d'XP sur ce serveur. Ça vient en discutant !`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        rankEmbed({
          rank: memberRank,
          displayName: member?.displayName ?? user.displayName,
          avatarUrl: (member ?? user).displayAvatarURL({ size: 256 }),
        }),
      ],
    });
  },
};