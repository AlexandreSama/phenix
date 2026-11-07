import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { DAY_MS, parseDuration } from '../../../core/duration.js';
import { reasonOption, refuse } from '../common.js';
import { BOT_TOO_LOW, checkMembers } from '../guards.js';
import { applySanction } from '../sanction.js';

export const BAN_MAX_MS = 365 * DAY_MS;

export const ban: SlashCommand = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre, pour un temps donné ou définitivement')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option
        .setName('membre')
        .setDescription("Le membre, ou l'ID d'un utilisateur absent du serveur")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('durée')
        .setDescription('10m, 2h, 7j… Sans durée, le ban est définitif')
        .setMaxLength(20),
    )
    .addIntegerOption((option) =>
      option
        .setName('messages')
        .setDescription('Supprimer ses messages récents')
        .addChoices(
          { name: 'Ne rien supprimer', value: 0 },
          { name: 'Dernière heure', value: 3_600 },
          { name: 'Dernières 24 heures', value: 86_400 },
          { name: '7 derniers jours', value: 604_800 },
        ),
    )
    .addStringOption(reasonOption()),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const user = interaction.options.getUser('membre', true);
    const member = interaction.options.getMember('membre');

    const durationInput = interaction.options.getString('durée');
    const durationMs = durationInput ? parseDuration(durationInput) : undefined;
    if (durationMs === null) {
      return refuse(interaction, 'Durée illisible. Exemples : 10m, 2h, 7j.');
    }
    if (durationMs && durationMs > BAN_MAX_MS) {
      return refuse(
        interaction,
        'Un ban temporaire dure au plus 365 jours. Sans durée, il est définitif.',
      );
    }

    if (member) {
      const refusal = checkMembers(interaction.member, member);
      if (refusal) return refuse(interaction, refusal);
      if (!member.bannable) return refuse(interaction, BOT_TOO_LOW);
    } else if (user.id === interaction.client.user.id) {
      return refuse(interaction, 'Je ne vais pas me sanctionner moi-même.');
    }

    const deleteMessageSeconds = interaction.options.getInteger('messages') ?? 0;

    await applySanction(
      interaction,
      {
        type: 'BAN',
        target: user,
        reason: interaction.options.getString('raison'),
        durationMs,
        // Un utilisateur absent du serveur ne partage peut-être aucun serveur avec le bot
        notify: member !== null,
        revokes: 'BAN',
        act: (reason) => interaction.guild.bans.create(user.id, { reason, deleteMessageSeconds }),
      },
      context,
    );
  },
};
