import { getMemberRank } from '@phenix/database';
import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { rankReply } from '../rank-card.js';

/**
 * Qui dessiner : le membre ciblé s'il est encore sur le serveur, sinon son compte (il a quitté),
 * sinon soi. Jamais `interaction.member` pour une cible : ce serait le visage de l'auteur.
 */
function resolveSubject(interaction: ChatInputCommandInteraction<'cached'>) {
  const target = interaction.options.getUser('membre');
  if (target) return interaction.options.getMember('membre') ?? target;
  return interaction.member;
}

export const rank: SlashCommand = {
  category: 'leveling',
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Affiche le niveau et l'XP d'un membre")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Le membre (toi par défaut)').setRequired(false),
    ),

  async execute(interaction, { db, logger }) {
    if (!interaction.inCachedGuild()) return;
    const user = interaction.options.getUser('membre') ?? interaction.user;

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

    // Le téléchargement de l'avatar et le dessin peuvent dépasser les 3 s de la première réponse
    await interaction.deferReply();
    const subject = resolveSubject(interaction);
    const reply = await rankReply(
      {
        rank: memberRank,
        displayName: subject.displayName,
        guildName: interaction.guild.name,
        // Statique : un avatar animé servi en .gif peut dépasser AVATAR_MAX_BYTES et donner
        // l'initiale, alors que la carte n'en dessine que la première image
        avatarUrl: subject.displayAvatarURL({ size: 256, forceStatic: true }),
      },
      { logger },
    );
    await interaction.editReply(reply);
  },
};
