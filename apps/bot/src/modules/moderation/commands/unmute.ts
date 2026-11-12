import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { memberOption, NOT_A_MEMBER, reasonOption, refuse } from '../common.js';
import { BOT_TOO_LOW, checkMembers } from '../guards.js';
import { applySanction } from '../sanction.js';

export const unmute: SlashCommand = {
  category: 'moderation',
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription("Lève la sourdine d'un membre")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(memberOption('Le membre en sourdine'))
    .addStringOption(reasonOption()),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getMember('membre');
    if (!target) return refuse(interaction, NOT_A_MEMBER);
    if (!target.isCommunicationDisabled()) {
      return refuse(interaction, "Ce membre n'est pas en sourdine.");
    }

    const refusal = checkMembers(interaction.member, target);
    if (refusal) return refuse(interaction, refusal);
    if (!target.moderatable) return refuse(interaction, BOT_TOO_LOW);

    await applySanction(
      interaction,
      {
        type: 'UNMUTE',
        target: target.user,
        reason: interaction.options.getString('raison'),
        notify: false,
        act: (reason) => target.timeout(null, reason),
      },
      context,
    );
  },
};
