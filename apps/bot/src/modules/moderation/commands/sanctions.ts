import { listCases } from '@phenix/database';
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { baseEmbed } from '../../../core/embeds.js';
import { caseLine } from '../case-format.js';
import { memberOption, refuse } from '../common.js';

const SHOWN = 15;

export const sanctions: SlashCommand = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('sanctions')
    .setDescription("Affiche l'historique des sanctions d'un membre")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(memberOption('Le membre')),

  async execute(interaction, { db }) {
    if (!interaction.inCachedGuild()) return;
    const user = interaction.options.getUser('membre', true);
    const where = { guildId: interaction.guildId, targetId: user.id };

    const [cases, total, activeWarns] = await Promise.all([
      listCases(db, interaction.guildId, user.id, SHOWN),
      db.case.count({ where }),
      db.case.count({ where: { ...where, type: 'WARN', revokedAt: null } }),
    ]);
    if (total === 0) return refuse(interaction, `Aucune sanction pour ${user} sur ce serveur.`);

    const now = new Date();
    const embed = baseEmbed()
      .setTitle(`Sanctions de ${user.displayName}`)
      .setDescription(cases.map((sanction) => caseLine(sanction, now)).join('\n\n'))
      .addFields(
        { name: 'Total', value: `${total}`, inline: true },
        { name: 'Avertissements actifs', value: `${activeWarns}`, inline: true },
      )
      .setFooter({
        text:
          total > SHOWN
            ? `Les ${SHOWN} plus récentes sur ${total} · /case pour le détail`
            : '/case pour le détail',
      });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
