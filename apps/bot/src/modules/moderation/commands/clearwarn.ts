import { revokeCases } from '@phenix/database';
import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { memberOption, refuse } from '../common.js';
import { actionEmbed, sendModLog } from '../modlog.js';

export const clearwarn: SlashCommand = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('clearwarn')
    .setDescription("Retire les avertissements d'un membre (ils restent dans l'historique)")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(memberOption('Le membre'))
    .addIntegerOption((option) =>
      option
        .setName('numéro')
        .setDescription('Un seul avertissement, par son numéro de case')
        .setMinValue(1),
    ),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const user = interaction.options.getUser('membre', true);
    const number = interaction.options.getInteger('numéro') ?? undefined;

    const count = await revokeCases(context.db, {
      guildId: interaction.guildId,
      targetId: user.id,
      type: 'WARN',
      revokedById: interaction.user.id,
      number,
    });
    if (count === 0) {
      return refuse(
        interaction,
        number === undefined
          ? `${user} n'a aucun avertissement actif.`
          : `La case #${number} n'est pas un avertissement actif de ${user}.`,
      );
    }

    const summary =
      count === 1
        ? `1 avertissement retiré pour ${user}.`
        : `${count} avertissements retirés pour ${user}.`;
    await interaction.reply(summary);
    await sendModLog(
      interaction.guild,
      actionEmbed('Avertissements retirés', interaction.user, summary),
      context,
    );
  },
};
