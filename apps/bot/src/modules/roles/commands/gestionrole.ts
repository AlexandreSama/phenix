import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { memberOption, NOT_A_MEMBER, refuse } from '../../moderation/common.js';
import { actionEmbed, sendModLog } from '../../moderation/modlog.js';
import { checkRoleChange } from '../role-check.js';

const subcommand =
  (name: string, description: string, roleHelp: string) => (sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName(name)
      .setDescription(description)
      .addUserOption(memberOption('Le membre'))
      .addRoleOption((option) => option.setName('rôle').setDescription(roleHelp).setRequired(true));

export const gestionrole: SlashCommand = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('gestionrole')
    .setDescription('Donne ou retire un rôle à un membre')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand('ajouter', 'Donne un rôle à un membre', 'Le rôle à donner'))
    .addSubcommand(subcommand('retirer', 'Retire un rôle à un membre', 'Le rôle à retirer')),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const adding = interaction.options.getSubcommand() === 'ajouter';
    const target = interaction.options.getMember('membre');
    if (!target) return refuse(interaction, NOT_A_MEMBER);
    const role = interaction.options.getRole('rôle', true);

    const refusal = checkRoleChange({
      actorId: interaction.user.id,
      targetId: target.id,
      ownerId: interaction.guild.ownerId,
      actorTop: interaction.member.roles.highest.position,
      targetTop: target.roles.highest.position,
      role: {
        position: role.position,
        managed: role.managed,
        isEveryone: role.id === interaction.guildId,
        botCanEdit: role.editable,
      },
    });
    if (refusal) return refuse(interaction, refusal);

    const has = target.roles.cache.has(role.id);
    if (adding && has) return refuse(interaction, `${target} a déjà le rôle ${role}.`);
    if (!adding && !has) return refuse(interaction, `${target} n'a pas le rôle ${role}.`);

    const reason = `${interaction.user.tag} via /gestionrole`;
    if (adding) await target.roles.add(role, reason);
    else await target.roles.remove(role, reason);

    await interaction.reply({
      content: adding ? `Rôle ${role} donné à ${target}.` : `Rôle ${role} retiré à ${target}.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    await sendModLog(
      interaction.guild,
      actionEmbed(
        adding ? 'Rôle donné' : 'Rôle retiré',
        interaction.user,
        `${role} ${adding ? 'donné à' : 'retiré à'} ${target}`,
      ),
      context,
    );
  },
};
