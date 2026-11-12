import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { memberOption, NOT_A_MEMBER, reasonOption, refuse } from '../common.js';
import { checkMembers } from '../guards.js';
import { applySanction } from '../sanction.js';

export const warn: SlashCommand = {
  category: 'moderation',
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Donne un avertissement à un membre')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(memberOption('Le membre à avertir'))
    .addStringOption(reasonOption(true)),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getMember('membre');
    if (!target) return refuse(interaction, NOT_A_MEMBER);

    const refusal = checkMembers(interaction.member, target);
    if (refusal) return refuse(interaction, refusal);

    await applySanction(
      interaction,
      {
        type: 'WARN',
        target: target.user,
        reason: interaction.options.getString('raison', true),
        notify: true,
      },
      context,
    );
  },
};
