import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import { DAY_MS, parseDuration } from '../../../core/duration.js';
import { memberOption, NOT_A_MEMBER, reasonOption, refuse } from '../common.js';
import { BOT_TOO_LOW, checkMembers } from '../guards.js';
import { applySanction } from '../sanction.js';

/** Limite de Discord pour une exclusion temporaire (timeout). */
export const MUTE_MAX_MS = 28 * DAY_MS;

export const mute: SlashCommand = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription("Empêche un membre d'écrire et de parler pendant un temps donné")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(memberOption('Le membre à mettre en sourdine'))
    .addStringOption((option) =>
      option
        .setName('durée')
        .setDescription('10m, 2h, 7j… (28 jours au plus)')
        .setRequired(true)
        .setMaxLength(20),
    )
    .addStringOption(reasonOption()),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getMember('membre');
    if (!target) return refuse(interaction, NOT_A_MEMBER);

    const durationMs = parseDuration(interaction.options.getString('durée', true));
    if (!durationMs) return refuse(interaction, 'Durée illisible. Exemples : 10m, 2h, 1j12h.');
    if (durationMs > MUTE_MAX_MS) {
      return refuse(interaction, 'Discord limite la sourdine à 28 jours.');
    }

    const refusal = checkMembers(interaction.member, target);
    if (refusal) return refuse(interaction, refusal);
    if (target.permissions.has(PermissionFlagsBits.Administrator)) {
      return refuse(interaction, 'Discord ne permet pas de mettre un administrateur en sourdine.');
    }
    if (!target.moderatable) return refuse(interaction, BOT_TOO_LOW);

    await applySanction(
      interaction,
      {
        type: 'MUTE',
        target: target.user,
        reason: interaction.options.getString('raison'),
        durationMs,
        notify: true,
        revokes: 'MUTE',
        act: (reason) => target.timeout(durationMs, reason),
      },
      context,
    );
  },
};
