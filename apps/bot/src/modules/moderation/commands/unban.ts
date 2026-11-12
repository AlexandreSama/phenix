import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { reasonOption, refuse } from '../common.js';
import { applySanction } from '../sanction.js';

export const unban: SlashCommand = {
  category: 'moderation',
  requiredPermissions: PermissionFlagsBits.BanMembers,
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription("Lève le bannissement d'un utilisateur")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option
        .setName('utilisateur')
        .setDescription("L'utilisateur banni (colle son ID)")
        .setRequired(true),
    )
    .addStringOption(reasonOption()),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const user = interaction.options.getUser('utilisateur', true);

    const existing = await interaction.guild.bans.fetch(user.id).catch(() => null);
    if (!existing) return refuse(interaction, "Cet utilisateur n'est pas banni.");

    await applySanction(
      interaction,
      {
        type: 'UNBAN',
        target: user,
        reason: interaction.options.getString('raison'),
        notify: false,
        act: (reason) => interaction.guild.bans.remove(user.id, reason),
      },
      context,
    );
  },
};
