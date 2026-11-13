import {
  closeTicket,
  createTicket,
  findOpenTicket,
  findTicketType,
  listTicketTypes,
  reserveTicketNumber,
  type TicketTypeWithQuestions,
} from '@phenix/database';
import {
  ChannelType,
  ComponentType,
  MessageFlags,
  RESTJSONErrorCodes,
  type ButtonInteraction,
  type ModalMessageModalSubmitInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextChannel,
} from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import type { BotContext } from '../../core/context.js';
import { isDiscordError } from '../../core/publish.js';
import { buildTicketModal, readFormAnswers } from './form.js';
import {
  formAnswersMessage,
  ticketTypeChoice,
  welcomeMessage,
  type FormAnswer,
} from './messages.js';
import { ticketChannelName, ticketOverwrites } from './permissions.js';

export const OPEN_REPLIES = {
  notConfigured:
    'Les tickets ne sont pas configurés sur ce serveur (type de ticket ou catégorie manquants). ' +
    'Préviens un admin.',
  typeGone: 'Ce type de ticket n’existe plus. Préviens un admin : le panneau doit être republié.',
  inProgress: 'Ton ticket est déjà en cours de création…',
  missingPermissions:
    'Je ne peux pas créer le salon : il me faut « Gérer les salons » sur la catégorie des tickets, ' +
    'et les permissions que je donne aux membres (voir le salon, écrire, joindre des fichiers…).',
} as const;

/** Un salon déjà supprimé ne compte plus : son ticket est fermé, sans transcript. */
const CLOSED_WITHOUT_TRANSCRIPT = {
  closedById: null,
  closedByName: null,
  transcriptKey: null,
  messageCount: null,
};

type Chooser = ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>;
type Submission = ModalSubmitInteraction<'cached'>;
type Opener = Chooser | Submission;

const ephemeral = (interaction: Chooser, content: string) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral });

/**
 * Vrai quand l'interaction vient du menu des types (visible du seul membre) : le menu ou le
 * formulaire ouvert depuis lui. Le panneau public, lui, n'est jamais modifié.
 */
function fromTypeMenu(
  interaction: Opener,
): interaction is
  StringSelectMenuInteraction<'cached'> | ModalMessageModalSubmitInteraction<'cached'> {
  const fromMessage =
    interaction.isStringSelectMenu() ||
    (interaction.isModalSubmit() && interaction.isFromMessage());
  return fromMessage && interaction.message.flags.has(MessageFlags.Ephemeral);
}

/**
 * Accuse réception avant la création du salon (plus de 3 s parfois). Depuis le menu des types, le
 * résultat prend la place du menu ; sinon c'est une réponse à part, visible du seul membre.
 */
const acknowledge = (interaction: Opener) =>
  fromTypeMenu(interaction)
    ? interaction.deferUpdate()
    : interaction.deferReply({ flags: MessageFlags.Ephemeral });

/** Le résultat dit au membre ; il remplace le menu des types s'il est encore là. */
const respond = (interaction: Opener, content: string) =>
  interaction.editReply({ content, components: [] });

/** Le type demandé. Un type d'un autre serveur n'existe pas, pour ce serveur. */
async function resolveType(
  { db }: BotContext,
  guildId: string,
  id: string,
): Promise<TicketTypeWithQuestions | null> {
  if (!/^\d+$/.test(id)) return null;
  const type = await findTicketType(db, Number(id));
  return type?.guildId === guildId ? type : null;
}

/**
 * Ce qui empêche d'ouvrir un ticket de ce type, dit à la personne : catégorie disparue, ou ticket
 * déjà ouvert. Un ticket dont le salon a disparu (supprimé pendant que le bot était éteint) est fermé.
 */
async function findBlocker(
  { guild, member }: Pick<Opener, 'guild' | 'member'>,
  type: TicketTypeWithQuestions,
  { db }: BotContext,
): Promise<string | null> {
  if (guild.channels.cache.get(type.categoryId)?.type !== ChannelType.GuildCategory) {
    return OPEN_REPLIES.notConfigured;
  }
  const existing = await findOpenTicket(db, guild.id, member.id);
  if (!existing) return null;
  if (guild.channels.cache.has(existing.channelId)) {
    return `Tu as déjà un ticket ouvert : <#${existing.channelId}>`;
  }
  await closeTicket(db, existing.id, CLOSED_WITHOUT_TRANSCRIPT);
  return null;
}

/**
 * Crée le salon privé du ticket dans la catégorie du type, que seuls l'auteur, l'équipe du type
 * et le bot voient, puis y poste l'accueil et les réponses du formulaire. Renvoie la phrase à
 * montrer à l'auteur. Les réponses ne vont que dans le salon : jamais en base, jamais dans les logs.
 */
async function createTicketChannel(
  interaction: Opener,
  type: TicketTypeWithQuestions,
  answers: FormAnswer[],
  { db, logger }: BotContext,
): Promise<string> {
  const { guild, member } = interaction;
  // Un rôle supprimé depuis le réglage ferait échouer toute la création
  const staffRoleIds = type.staffRoleIds.filter((id) => guild.roles.cache.has(id));
  const number = await reserveTicketNumber(db, guild.id);

  let channel: TextChannel;
  try {
    channel = await guild.channels.create({
      name: ticketChannelName(number),
      type: ChannelType.GuildText,
      parent: type.categoryId,
      topic: `Ticket de ${member.displayName}`,
      permissionOverwrites: ticketOverwrites({
        everyoneId: guild.roles.everyone.id,
        ownerId: member.id,
        staffRoleIds,
        botId: interaction.client.user.id,
      }),
      reason: `Ticket #${number} ouvert par ${member.user.tag}`,
    });
  } catch (err) {
    if (
      isDiscordError(err, RESTJSONErrorCodes.MissingPermissions) ||
      isDiscordError(err, RESTJSONErrorCodes.MissingAccess)
    ) {
      logger.warn({ err, guildId: guild.id }, 'Création du salon de ticket refusée');
      return OPEN_REPLIES.missingPermissions;
    }
    throw err;
  }

  try {
    const ticket = await createTicket(db, {
      guildId: guild.id,
      number,
      channelId: channel.id,
      ownerId: member.id,
      ownerName: member.displayName,
      typeId: type.id,
    });
    await channel.send(welcomeMessage(ticket, { name: type.name, staffRoleIds }));
    if (answers.length > 0) await channel.send(formAnswersMessage(answers));
  } catch (err) {
    // Pas de salon fantôme : sans ligne en base, personne ne pourrait le fermer
    await channel.delete('Ticket non enregistré').catch(() => undefined);
    throw err;
  }

  logger.info({ guildId: guild.id, number, typeId: type.id }, 'Ticket ouvert');
  return `Ton ticket est ouvert : ${channel}`;
}

/**
 * L'ouverture d'un ticket : le bouton unique du panneau (qui propose le menu des types), le menu
 * de choix, puis l'envoi du formulaire. Un ancien bouton `ticket:open:<id>`, posté avant le bouton
 * unique, ouvre directement son type.
 */
export function createOpenTicketHandlers(): ComponentHandler[] {
  // Le verrou en mémoire bloque le double clic ou le double envoi : sans lui, deux demandes
  // rapprochées passeraient toutes deux le test « déjà un ticket ouvert ».
  const opening = new Set<string>();

  /** Fait `action` sous le verrou de ce membre ; s'il est déjà pris, prévient et ne fait rien. */
  async function locked(interaction: Opener, action: () => Promise<void>): Promise<void> {
    const key = `${interaction.guildId}:${interaction.user.id}`;
    if (opening.has(key)) {
      await interaction.reply({ content: OPEN_REPLIES.inProgress, flags: MessageFlags.Ephemeral });
      return;
    }
    opening.add(key);
    try {
      await action();
    } finally {
      opening.delete(key);
    }
  }

  /**
   * Un type sans question ouvre le salon tout de suite ; un type avec questions montre le formulaire,
   * comme PREMIÈRE réponse : Discord ne l'accepte pas après un `deferReply`, et le test « déjà un
   * ticket ouvert » doit donc se faire avant, en moins de 3 secondes.
   */
  async function openType(
    interaction: Chooser,
    type: TicketTypeWithQuestions,
    context: BotContext,
  ) {
    if (type.questions.length > 0) {
      const blocker = await findBlocker(interaction, type, context);
      if (blocker) await ephemeral(interaction, blocker);
      else await interaction.showModal(buildTicketModal(type));
      return;
    }

    await locked(interaction, async () => {
      const blocker = await findBlocker(interaction, type, context);
      if (blocker) {
        await ephemeral(interaction, blocker);
        return;
      }
      // Créer un salon prend parfois plus de 3 s : on répond « en cours » tout de suite
      await acknowledge(interaction);
      await respond(interaction, await createTicketChannel(interaction, type, [], context));
    });
  }

  /** Le type d'un id (ancien bouton, menu de choix), ou la phrase qui dit pourquoi il n'existe plus. */
  async function choose(interaction: Chooser, id: string, context: BotContext) {
    const type = await resolveType(context, interaction.guildId, id);
    if (type) await openType(interaction, type, context);
    else await ephemeral(interaction, OPEN_REPLIES.typeGone);
  }

  /**
   * Le bouton unique du panneau : le menu des types, visible du seul membre. Sans choix possible
   * (un seul type), on saute le menu ; sans type, rien ne s'ouvre.
   */
  async function offerTypes(interaction: Chooser, context: BotContext) {
    const types = await listTicketTypes(context.db, interaction.guildId);
    const [first] = types;
    if (!first) {
      await ephemeral(interaction, OPEN_REPLIES.notConfigured);
    } else if (types.length === 1) {
      await openType(interaction, first, context);
    } else {
      await interaction.reply({ ...ticketTypeChoice(types), flags: MessageFlags.Ephemeral });
    }
  }

  const open: ComponentHandler = {
    prefix: 'ticket:open',
    async execute(interaction, id, context) {
      if (!interaction.isButton() || !interaction.inCachedGuild()) return;
      if (id === undefined) await offerTypes(interaction, context);
      else await choose(interaction, id, context);
    },
  };

  const menu: ComponentHandler = {
    prefix: 'ticket:choose',
    async execute(interaction, _id, context) {
      if (!interaction.isStringSelectMenu() || !interaction.inCachedGuild()) return;
      await choose(interaction, interaction.values[0] ?? '', context);
    },
  };

  const form: ComponentHandler = {
    prefix: 'ticket:form',
    async execute(interaction, id, context) {
      if (!interaction.isModalSubmit() || !interaction.inCachedGuild()) return;
      await locked(interaction, async () => {
        await acknowledge(interaction);
        // Le type et le ticket ouvert sont relus : ils ont pu changer pendant que le formulaire se remplissait
        const type = await resolveType(context, interaction.guildId, id ?? '');
        if (!type) {
          await respond(interaction, OPEN_REPLIES.typeGone);
          return;
        }
        const blocker = await findBlocker(interaction, type, context);
        if (blocker) {
          await respond(interaction, blocker);
          return;
        }
        const submitted = [...interaction.fields.fields.values()].flatMap((field) =>
          field.type === ComponentType.TextInput
            ? [{ customId: field.customId, value: field.value }]
            : [],
        );
        const answers = readFormAnswers(type, submitted);
        await respond(interaction, await createTicketChannel(interaction, type, answers, context));
      });
    },
  };

  return [open, menu, form];
}
