import {
  createTd2Event,
  deleteTd2Event,
  listTd2Activities,
  markTd2EventPublished,
  type Td2ActivityKind,
} from '@phenix/database';
import { parseEventDate, TD2_KIND_LABELS, TD2_ROLE_LABELS } from '@phenix/shared';
import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import type { BotContext } from '../../../core/context.js';
import { describePublishError } from '../../../core/publish.js';
import { refuse } from '../../moderation/common.js';
import { ROLE_ORDER, td2EventMessage } from '../messages.js';

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
} as const;

const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** « 6 DPS · 1 Heal · 1 Tank », dans l'ordre des boutons. */
export function compositionText(mode: Pick<Mode, 'slots'>): string {
  return ROLE_ORDER.flatMap((role) => mode.slots.filter((slot) => slot.role === role))
    .map((slot) => `${slot.count} ${TD2_ROLE_LABELS[slot.role]}`)
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

  const parsed = parseEventDate(interaction.options.getString('date', true), {
    now: new Date(),
    timeZone: settings?.timezone ?? DEFAULT_TIMEZONE,
  });
  if (!parsed.ok) return refuse(interaction, parsed.error);

  // Le salon des sorties choisi sur le site, sinon celui de la commande
  const channelId = settings?.td2ChannelId ?? interaction.channelId;
  const channel =
    interaction.guild.channels.cache.get(channelId) ??
    (await interaction.guild.channels.fetch(channelId).catch(() => null));
  const me = interaction.guild.members.me;
  if (!channel?.isSendable() || !me || !channel.permissionsFor(me).has(POST_PERMISSIONS)) {
    return refuse(interaction, TD2_COMMAND_REPLIES.notWritable(channelId));
  }

  const event = await createTd2Event(db, {
    guildId: interaction.guildId,
    modeId: mode.id,
    scheduledAt: parsed.date,
    channelId: channel.id,
    organizerId: interaction.user.id,
  });
  if (!event) return refuse(interaction, TD2_COMMAND_REPLIES.unknownMode);

  try {
    const message = await channel.send(td2EventMessage(event));
    await markTd2EventPublished(db, event.id, message.id);
  } catch (err) {
    // Sans message, personne ne pourrait s'inscrire : la sortie n'a pas de raison d'exister
    await deleteTd2Event(db, event.id);
    return refuse(interaction, TD2_COMMAND_REPLIES.postFailed(describePublishError(err)));
  }
  await context.td2.schedule(event.id, event.scheduledAt);
  context.logger.info({ guildId: interaction.guildId, eventId: event.id }, 'Sortie TD2 créée');

  await interaction.reply({
    content:
      `Sortie #${event.id} postée dans <#${channel.id}> : ` +
      `${time(event.scheduledAt, TimestampStyles.LongDateTime)} ` +
      `(${time(event.scheduledAt, TimestampStyles.RelativeTime)}).`,
    flags: MessageFlags.Ephemeral,
  });
}

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
    .setDescription('The Division 2 : raids et incursions')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(subcommand('RAID'))
    .addSubcommand(subcommand('INCURSION')),

  async execute(interaction, context) {
    if (!interaction.inCachedGuild()) return;
    return create(kindOf(interaction.options.getSubcommand()), interaction, context);
  },

  /** L'activité depuis le catalogue, puis les modes de l'activité déjà choisie. */
  async autocomplete(interaction, { db }) {
    const kind = kindOf(interaction.options.getSubcommand());
    const focused = interaction.options.getFocused(true);
    const typed = normalize(String(focused.value));
    const activities = await listTd2Activities(db, kind);

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
