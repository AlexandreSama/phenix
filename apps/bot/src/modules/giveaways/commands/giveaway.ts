import { advanceGiveawayEnd, createGiveaway, findGiveaway, listGiveaways } from '@phenix/database';
import { GIVEAWAY_LIMITS, giveawayEndProblem } from '@phenix/shared';
import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  type ChatInputCommandInteraction,
  type SlashCommandIntegerOption,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import type { BotContext } from '../../../core/context.js';
import { parseDuration } from '../../../core/duration.js';
import { refuse } from '../../moderation/common.js';

export const GIVEAWAY_REPLIES = {
  badDuration: 'Durée invalide : écris par exemple « 30m », « 2h », « 3j » ou « 1j12h ».',
  notWritable: (channelId: string) =>
    `Je ne peux pas poster dans <#${channelId}> : il me faut « Voir le salon », ` +
    '« Envoyer des messages » et « Intégrer des liens ».',
  userCannotWrite: (channelId: string) =>
    `Tu ne peux pas écrire dans <#${channelId}> : choisis un salon où tu as « Envoyer des messages ».`,
  unknown: (id: number) => `Aucun giveaway #${id} sur ce serveur.`,
  alreadyEnded: (id: number) => `Le giveaway #${id} est déjà terminé.`,
  notEnded: (id: number) => `Le giveaway #${id} n'est pas encore terminé.`,
  notAnnounced: (id: number) =>
    `Le tirage du giveaway #${id} n'est pas encore annoncé : attends l'annonce avant de relancer.`,
} as const;

/** Permissions dont le bot a besoin dans le salon du giveaway. */
const POST_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

const idOption = (option: SlashCommandIntegerOption) =>
  option
    .setName('id')
    .setDescription('Le numéro du giveaway (#…)')
    .setRequired(true)
    .setMinValue(1)
    .setAutocomplete(true);

async function create(interaction: ChatInputCommandInteraction<'cached'>, context: BotContext) {
  const prize = interaction.options.getString('lot', true).trim();
  const durationMs = parseDuration(interaction.options.getString('durée', true));
  const winnersCount = interaction.options.getInteger('gagnants') ?? 1;
  const channel = interaction.options.getChannel('salon') ?? interaction.channel;
  const role = interaction.options.getRole('rôle');

  if (durationMs === null) return refuse(interaction, GIVEAWAY_REPLIES.badDuration);
  const now = new Date();
  const endsAt = new Date(now.getTime() + durationMs);
  const problem = giveawayEndProblem(endsAt, now);
  if (problem) return refuse(interaction, `${problem}.`);

  const me = interaction.guild.members.me;
  if (!channel?.isSendable() || !me || !channel.permissionsFor(me).has(POST_PERMISSIONS)) {
    return refuse(interaction, GIVEAWAY_REPLIES.notWritable(channel?.id ?? interaction.channelId));
  }
  // Le bot ne poste pas à la place de quelqu'un dans un salon où il n'a pas le droit d'écrire
  if (!channel.permissionsFor(interaction.member).has(PermissionFlagsBits.SendMessages)) {
    return refuse(interaction, GIVEAWAY_REPLIES.userCannotWrite(channel.id));
  }

  const giveaway = await createGiveaway(context.db, {
    guildId: interaction.guildId,
    channelId: channel.id,
    hostId: interaction.user.id,
    prize,
    winnersCount,
    requiredRoleId: role?.id ?? null,
    endsAt,
  });
  // Le worker poste le message dans la seconde, et tirera au sort à la date de fin
  await context.giveaways.publish(giveaway.id);
  await context.giveaways.scheduleEnd(giveaway.id, endsAt);
  context.logger.info({ guildId: interaction.guildId, giveawayId: giveaway.id }, 'Giveaway créé');

  await interaction.reply({
    content:
      `Giveaway #${giveaway.id} lancé dans ${channel} : tirage ` +
      `${time(endsAt, TimestampStyles.RelativeTime)}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function end(interaction: ChatInputCommandInteraction<'cached'>, context: BotContext) {
  const id = interaction.options.getInteger('id', true);
  const giveaway = await findGiveaway(context.db, id);
  if (giveaway?.guildId !== interaction.guildId) {
    return refuse(interaction, GIVEAWAY_REPLIES.unknown(id));
  }
  if (giveaway.announcedAt) return refuse(interaction, GIVEAWAY_REPLIES.alreadyEnded(id));

  // La fin devient maintenant (le site affiche « tirage en cours »), puis le tirage part.
  // Déjà tiré mais pas annoncé (salon inaccessible au tirage) : la tâche réessaie l'annonce.
  await advanceGiveawayEnd(context.db, id);
  await context.giveaways.endNow(id);
  await interaction.reply({
    content: giveaway.endedAt
      ? `Nouvel essai d'annonce pour le giveaway #${id}.`
      : `Tirage du giveaway #${id} lancé : les gagnants arrivent dans un instant.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function reroll(interaction: ChatInputCommandInteraction<'cached'>, context: BotContext) {
  const id = interaction.options.getInteger('id', true);
  const giveaway = await findGiveaway(context.db, id);
  if (giveaway?.guildId !== interaction.guildId) {
    return refuse(interaction, GIVEAWAY_REPLIES.unknown(id));
  }
  if (!giveaway.endedAt) return refuse(interaction, GIVEAWAY_REPLIES.notEnded(id));
  if (!giveaway.announcedAt) return refuse(interaction, GIVEAWAY_REPLIES.notAnnounced(id));

  await context.giveaways.reroll(id);
  await interaction.reply({
    content: `Nouveau tirage du giveaway #${id} lancé.`,
    flags: MessageFlags.Ephemeral,
  });
}

export const giveaway: SlashCommand = {
  category: 'giveaways',
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Lance, termine ou relance un giveaway')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('créer')
        .setDescription('Lance un giveaway')
        .addStringOption((option) =>
          option
            .setName('lot')
            .setDescription('Ce que les gagnants remportent')
            .setRequired(true)
            .setMaxLength(GIVEAWAY_LIMITS.prize),
        )
        .addStringOption((option) =>
          option
            .setName('durée')
            .setDescription('Temps avant le tirage : 30m, 2h, 3j, 1j12h…')
            .setRequired(true)
            .setMaxLength(20),
        )
        .addIntegerOption((option) =>
          option
            .setName('gagnants')
            .setDescription('Nombre de gagnants (1 par défaut)')
            .setMinValue(1)
            .setMaxValue(GIVEAWAY_LIMITS.winners),
        )
        .addChannelOption((option) =>
          option
            .setName('salon')
            .setDescription('Où poster le giveaway (ce salon par défaut)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) =>
          option.setName('rôle').setDescription('Réserve la participation à un rôle'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('terminer')
        .setDescription('Fait le tirage tout de suite')
        .addIntegerOption(idOption),
    )
    .addSubcommand((sub) =>
      sub
        .setName('relancer')
        .setDescription('Tire de nouveaux gagnants parmi les autres participants')
        .addIntegerOption(idOption),
    ),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'créer') return create(interaction, context);
    if (subcommand === 'terminer') return end(interaction, context);
    return reroll(interaction, context);
  },

  /** Propose les giveaways en cours pour « terminer », les terminés pour « relancer ». */
  async autocomplete(interaction, { db }) {
    if (!interaction.inCachedGuild()) return;
    const status = interaction.options.getSubcommand() === 'terminer' ? 'active' : 'ended';
    const typed = String(interaction.options.getFocused()).trim();
    const { giveaways } = await listGiveaways(db, interaction.guildId, status, 1, 25);
    await interaction.respond(
      giveaways
        .filter((row) => typed === '' || String(row.id).startsWith(typed))
        .map((row) => ({ name: `#${row.id} · ${row.prize}`.slice(0, 100), value: row.id })),
    );
  },
};
