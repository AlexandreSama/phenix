import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { levelUpReply } from '../level-card.js';

/**
 * Aperçu de la carte de passage de niveau, sans avoir à monter de niveau. Réservée aux
 * gestionnaires du serveur : c'est un outil de prévisualisation, pas une commande de membre.
 */
export const levelup: SlashCommand = {
  category: 'leveling',
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName('passage-de-niveau')
    .setDescription('Prévisualise la carte de passage de niveau')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Le membre (toi par défaut)').setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('niveau')
        .setDescription('Le niveau à afficher (1–999, 5 par défaut)')
        .setMinValue(1)
        .setMaxValue(999)
        .setRequired(false),
    ),

  async execute(interaction, { logger }) {
    if (!interaction.inCachedGuild()) return;

    const level = interaction.options.getInteger('niveau') ?? 5;
    const target = interaction.options.getMember('membre');

    // Un membre désigné mais absent du serveur : on le dit, plutôt que de dessiner l'auteur
    if (!target && interaction.options.getUser('membre')) {
      await interaction.reply({
        content: "Ce membre n'est pas sur le serveur.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subject = target ?? interaction.member;

    // Le téléchargement de l'avatar et le dessin peuvent dépasser les 3 s de la première réponse
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reply = await levelUpReply(
      {
        displayName: subject.displayName,
        level,
        // Statique : un avatar animé servi en .gif peut dépasser AVATAR_MAX_BYTES
        avatarUrl: subject.displayAvatarURL({ size: 256, forceStatic: true }),
      },
      { logger },
    );
    await interaction.editReply(reply);
  },
};
