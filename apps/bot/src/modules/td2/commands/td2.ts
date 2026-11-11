import {
  createTd2Event,
  createTd2Mission,
  deleteTd2Event,
  listTd2Activities,
  listTd2Directives,
  markTd2EventPublished,
  type Td2ActivityKind,
  type Td2Difficulty,
  type Td2EventDetails,
} from '@phenix/database';
import {
  parseEventDate,
  TD2_DIFFICULTY_LABELS,
  TD2_KIND_LABELS,
  TD2_MISSION_LIMITS,
  TD2_SIGNUP_ROLE_LABELS,
  type Td2DifficultyKey,
} from '@phenix/shared';
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  type ChatInputCommandInteraction,
  type SendableChannels,
  type SlashCommandStringOption,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import type { BotContext } from '../../../core/context.js';
import { describePublishError } from '../../../core/publish.js';
import { refuse } from '../../moderation/common.js';
import { directivesMenu, ROLE_ORDER, td2EventMessage } from '../messages.js';
import {
  lookupPlayer,
  lookupSubcommand,
  reportPlayer,
  reportSubcommand,
} from '../reports/command.js';
import {
  autocompletePlayer,
  linkAccount,
  linkSubcommand,
  showStats,
  statsSubcommand,
  unlinkAccount,
  unlinkSubcommand,
} from '../stats/command.js';

type Activity = Awaited<ReturnType<typeof listTd2Activities>>[number];
type Mode = Activity['modes'][number];

const DEFAULT_TIMEZONE = 'Europe/Paris';

/** Permissions dont le bot a besoin dans le salon des sorties. */
const POST_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

export const TD2_COMMAND_REPLIES = {
  unknownActivity: (kind: Td2ActivityKind) =>
    `${TD2_KIND_LABELS[kind]} inconnu${kind === 'INCURSION' ? 'e' : ''} : choisis dans la liste proposée.`,
  unknownMode: 'Mode inconnu : choisis dans la liste proposée.',
  notWritable: (channelId: string) =>
    `Je ne peux pas poster dans <#${channelId}> : il me faut « Voir le salon », ` +
    '« Envoyer des messages » et « Intégrer des liens ».',
  postFailed: (reason: string) => `La sortie n'a pas pu être postée : ${reason}.`,
  unknownDifficulty: 'Difficulté inconnue : choisis dans la liste proposée.',
  posted: (event: Pick<Td2EventDetails, 'id' | 'channelId' | 'scheduledAt'>) =>
    `Sortie #${event.id} postée dans <#${event.channelId}> : ` +
    `${time(event.scheduledAt, TimestampStyles.LongDateTime)} ` +
    `(${time(event.scheduledAt, TimestampStyles.RelativeTime)}).`,
  pickDirectives:
    'Ajoute des directives pour corser la mission (modifiables ensuite avec « Gérer ») :',
} as const;

const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** « 6 DPS · 1 Heal · 1 Tank », dans l'ordre des boutons. */
export function compositionText(mode: Pick<Mode, 'slots'>): string {
  return ROLE_ORDER.flatMap((role) => mode.slots.filter((slot) => slot.role === role))
    .map((slot) => `${slot.count} ${TD2_SIGNUP_ROLE_LABELS[slot.role]}`)
    .join(' · ');
}

/**
 * La valeur choisie dans l'autocomplétion est un ID ; un nom tapé à la main
 * (« dark hours ») est accepté aussi, sans tenir compte des accents ni des majuscules.
 */
function pick<T extends { id: number; name: string }>(
  items: T[],
  value: string | null,
): T | undefined {
  if (!value) return undefined;
  return (
    items.find((item) => String(item.id) === value) ??
    items.find((item) => normalize(item.name) === normalize(value))
  );
}

const activityOption = (option: SlashCommandStringOption) =>
  option
    .setName('activité')
    .setDescription('Choisis dans la liste')
    .setRequired(true)
    .setAutocomplete(true);

const dateOption = (option: SlashCommandStringOption) =>
  option
    .setName('date')
    .setDescription('« samedi 21h », « demain 20h30 », « 14/11 21h », « dans 2h »…')
    .setRequired(true)
    .setMaxLength(60);

type Settings = Awaited<ReturnType<BotContext['configs']['get']>>;

/** La date tapée, lue dans le fuseau du serveur. null : refusée (le membre a sa réponse). */
async function readDate(
  interaction: ChatInputCommandInteraction<'cached'>,
  settings: Settings,
): Promise<Date | null> {
  const parsed = parseEventDate(interaction.options.getString('date', true), {
    now: new Date(),
    timeZone: settings?.timezone ?? DEFAULT_TIMEZONE,
  });
  if (parsed.ok) return parsed.date;
  await refuse(interaction, parsed.error);
  return null;
}

/** Le salon des sorties choisi sur le site, sinon celui de la commande. null : le bot n'y écrit pas. */
async function eventChannel(
  interaction: ChatInputCommandInteraction<'cached'>,
  settings: Settings,
): Promise<SendableChannels | null> {
  const channelId = settings?.td2ChannelId ?? interaction.channelId;
  const channel =
    interaction.guild.channels.cache.get(channelId) ??
    (await interaction.guild.channels.fetch(channelId).catch(() => null));
  const me = interaction.guild.members.me;
  if (channel?.isSendable() && me && channel.permissionsFor(me).has(POST_PERMISSIONS)) {
    return channel;
  }
  await refuse(interaction, TD2_COMMAND_REPLIES.notWritable(channelId));
  return null;
}

/**
 * Poste le message de la sortie et planifie son rappel et sa fermeture.
 * false : message impossible, la sortie est retirée (personne ne pourrait s'y inscrire).
 */
async function publish(
  interaction: ChatInputCommandInteraction<'cached'>,
  context: BotContext,
  channel: SendableChannels,
  event: Td2EventDetails,
): Promise<boolean> {
  try {
    const message = await channel.send(td2EventMessage(event));
    await markTd2EventPublished(context.db, event.id, message.id);
  } catch (err) {
    await deleteTd2Event(context.db, event.id);
    await refuse(interaction, TD2_COMMAND_REPLIES.postFailed(describePublishError(err)));
    return false;
  }
  await context.td2.schedule(event.id, event.scheduledAt);
  context.logger.info({ guildId: interaction.guildId, eventId: event.id }, 'Sortie TD2 créée');
  return true;
}

async function create(
  kind: Td2ActivityKind,
  interaction: ChatInputCommandInteraction<'cached'>,
  context: BotContext,
) {
  const { db } = context;
  const settings = await context.configs.get(interaction.guildId);

  const activities = await listTd2Activities(db, kind);
  const activity = pick(activities, interaction.options.getString('activité', true));
  if (!activity) return refuse(interaction, TD2_COMMAND_REPLIES.unknownActivity(kind));
  // Une activité à un seul mode (les incursions) saute ce choix
  const mode =
    activity.modes.length === 1
      ? activity.modes[0]
      : pick(activity.modes, interaction.options.getString('mode'));
  if (!mode) return refuse(interaction, TD2_COMMAND_REPLIES.unknownMode);

  const scheduledAt = await readDate(interaction, settings);
  if (!scheduledAt) return;
  const channel = await eventChannel(interaction, settings);
  if (!channel) return;

  const event = await createTd2Event(db, {
    guildId: interaction.guildId,
    modeId: mode.id,
    scheduledAt,
    channelId: channel.id,
    organizerId: interaction.user.id,
  });
  if (!event) return refuse(interaction, TD2_COMMAND_REPLIES.unknownMode);
  if (!(await publish(interaction, context, channel, event))) return;

  await interaction.reply({
    content: TD2_COMMAND_REPLIES.posted(event),
    flags: MessageFlags.Ephemeral,
  });
}

const isDifficulty = (value: string): value is Td2DifficultyKey => value in TD2_DIFFICULTY_LABELS;

/** /td2 mission : un nom libre, une difficulté, des places sans rôle, puis les directives. */
async function createMission(
  interaction: ChatInputCommandInteraction<'cached'>,
  context: BotContext,
) {
  const { db } = context;
  const settings = await context.configs.get(interaction.guildId);

  const difficulty = interaction.options.getString('difficulté', true);
  if (!isDifficulty(difficulty)) {
    return refuse(interaction, TD2_COMMAND_REPLIES.unknownDifficulty);
  }
  const scheduledAt = await readDate(interaction, settings);
  if (!scheduledAt) return;
  const channel = await eventChannel(interaction, settings);
  if (!channel) return;

  const event = await createTd2Mission(db, {
    guildId: interaction.guildId,
    missionName: interaction.options.getString('nom', true).trim(),
    difficulty: difficulty satisfies Td2Difficulty,
    players: interaction.options.getInteger('joueurs') ?? TD2_MISSION_LIMITS.maxPlayers,
    scheduledAt,
    channelId: channel.id,
    organizerId: interaction.user.id,
  });
  if (!(await publish(interaction, context, channel, event))) return;

  // Les directives se choisissent juste après, dans un menu à choix multiples
  const menu = directivesMenu(event, await listTd2Directives(db, { activeOnly: true }));
  await interaction.reply({
    content: [
      TD2_COMMAND_REPLIES.posted(event),
      ...(menu ? [TD2_COMMAND_REPLIES.pickDirectives] : []),
    ].join('\n'),
    components: menu ? [menu] : [],
    flags: MessageFlags.Ephemeral,
  });
}

const missionSubcommand = (sub: SlashCommandSubcommandBuilder) =>
  sub
    .setName('mission')
    .setDescription('Organise une mission : son nom, sa difficulté et la date')
    .addStringOption((option) =>
      option
        .setName('nom')
        .setDescription('« Capitole », « Farm exotiques au Pentagone »…')
        .setRequired(true)
        .setMaxLength(TD2_MISSION_LIMITS.nameMax),
    )
    .addStringOption((option) =>
      option
        .setName('difficulté')
        .setDescription('Comme dans le jeu')
        .setRequired(true)
        .addChoices(
          Object.entries(TD2_DIFFICULTY_LABELS).map(([value, name]) => ({ name, value })),
        ),
    )
    .addStringOption(dateOption)
    .addIntegerOption((option) =>
      option
        .setName('joueurs')
        .setDescription(`Nombre de places, ${TD2_MISSION_LIMITS.maxPlayers} par défaut`)
        .setMinValue(1)
        .setMaxValue(TD2_MISSION_LIMITS.maxPlayers),
    );

const subcommand =
  (kind: Td2ActivityKind) =>
  (sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder => {
    sub
      .setName(kind === 'RAID' ? 'raid' : 'incursion')
      .setDescription(
        kind === 'RAID'
          ? 'Organise un raid : activité, mode et date'
          : 'Organise une incursion : activité et date',
      )
      .addStringOption(activityOption);
    if (kind === 'RAID') {
      sub.addStringOption((option) =>
        option
          .setName('mode')
          .setDescription('Normal, Semi-Speed…')
          .setRequired(true)
          .setAutocomplete(true),
      );
    }
    return sub.addStringOption(dateOption);
  };

const kindOf = (name: string): Td2ActivityKind => (name === 'raid' ? 'RAID' : 'INCURSION');

export const td2: SlashCommand = {
  category: 'td2',
  data: new SlashCommandBuilder()
    .setName('td2')
    .setDescription('The Division 2 : raids, incursions, missions, signalements et stats')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(subcommand('RAID'))
    .addSubcommand(subcommand('INCURSION'))
    .addSubcommand(missionSubcommand)
    .addSubcommand(reportSubcommand)
    .addSubcommand(lookupSubcommand)
    .addSubcommand(statsSubcommand)
    .addSubcommand(linkSubcommand)
    .addSubcommand(unlinkSubcommand),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    switch (interaction.options.getSubcommand()) {
      case 'signaler':
        return reportPlayer(interaction, context);
      case 'signalements':
        return lookupPlayer(interaction, context);
      case 'stats':
        return showStats(interaction, context);
      case 'lier':
        return linkAccount(interaction, context);
      case 'délier':
        return unlinkAccount(interaction, context);
      case 'mission':
        return createMission(interaction, context);
      default:
        return create(kindOf(interaction.options.getSubcommand()), interaction, context);
    }
  },

  /**
   * Le pseudo d'un joueur, depuis le service de stats ; sinon l'activité depuis le catalogue,
   * puis les modes de l'activité déjà choisie.
   */
  async autocomplete(interaction, context) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'pseudo') {
      return autocompletePlayer(interaction, context, String(focused.value));
    }
    const kind = kindOf(interaction.options.getSubcommand());
    const typed = normalize(String(focused.value));
    const activities = await listTd2Activities(context.db, kind);

    if (focused.name === 'mode') {
      const activity = pick(activities, interaction.options.getString('activité'));
      await interaction.respond(
        (activity?.modes ?? [])
          .filter((mode) => normalize(mode.name).includes(typed))
          .map((mode) => ({
            name: `${mode.name} — ${compositionText(mode)}`.slice(0, 100),
            value: String(mode.id),
          }))
          .slice(0, 25),
      );
      return;
    }
    await interaction.respond(
      activities
        .filter((activity) => normalize(activity.name).includes(typed))
        .map((activity) => ({ name: activity.name, value: String(activity.id) }))
        .slice(0, 25),
    );
  },
};
