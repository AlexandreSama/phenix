import { getCase } from '@phenix/database';
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { caseEmbed, caseStatus } from '../case-format.js';
import { refuse } from '../common.js';

export const caseCommand: SlashCommand = {
  category: 'moderation',
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription("Affiche le détail d'une sanction")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption((option) =>
      option
        .setName('numéro')
        .setDescription('Le numéro de la case')
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction, { db }) {
    if (!interaction.inCachedGuild()) return;
    const number = interaction.options.getInteger('numéro', true);

    const sanction = await getCase(db, interaction.guildId, number);
    if (!sanction) return refuse(interaction, `Aucune case #${number} sur ce serveur.`);

    const embed = caseEmbed(sanction).addFields({ name: 'Statut', value: caseStatus(sanction) });
    if (sanction.revokedById) {
      embed.addFields({ name: 'Levée par', value: `<@${sanction.revokedById}>` });
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
