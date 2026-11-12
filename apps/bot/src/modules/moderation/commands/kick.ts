import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { memberOption, NOT_A_MEMBER, reasonOption, refuse } from '../common.js';
import { BOT_TOO_LOW, checkMembers } from '../guards.js';
import { applySanction } from '../sanction.js';

export const kick: SlashCommand = {
  category: 'moderation',
  requiredPermissions: PermissionFlagsBits.KickMembers,
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre du serveur (il pourra revenir avec une invitation)')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(memberOption('Le membre à expulser'))
    .addStringOption(reasonOption()),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getMember('membre');
    if (!target) return refuse(interaction, NOT_A_MEMBER);

    const refusal = checkMembers(interaction.member, target);
    if (refusal) return refuse(interaction, refusal);
    if (!target.kickable) return refuse(interaction, BOT_TOO_LOW);

    await applySanction(
      interaction,
      {
        type: 'KICK',
        target: target.user,
        reason: interaction.options.getString('raison'),
        notify: true,
        act: (reason) => target.kick(reason),
      },
      context,
    );
  },
};
