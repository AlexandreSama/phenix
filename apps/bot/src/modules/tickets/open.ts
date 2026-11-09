import { closeTicket, createTicket, findOpenTicket, reserveTicketNumber } from '@phenix/database';
import {
  ChannelType,
  MessageFlags,
  RESTJSONErrorCodes,
  type ButtonInteraction,
  type TextChannel,
} from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import type { BotContext } from '../../core/context.js';
import { isDiscordError } from '../../core/publish.js';
import { welcomeMessage } from './messages.js';
import { ticketChannelName, ticketOverwrites } from './permissions.js';

export const OPEN_REPLIES = {
  notConfigured:
    'Les tickets ne sont pas configurés sur ce serveur (catégorie manquante). Préviens un admin.',
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

/**
 * Ouvre un ticket : un salon privé dans la catégorie choisie sur le site, que seuls
 * l'auteur, l'équipe et le bot voient. Un membre n'a qu'un ticket ouvert à la fois.
 */
async function openTicket(interaction: ButtonInteraction<'cached'>, context: BotContext) {
  const { guild, member } = interaction;
  const { db, logger } = context;

  const settings = await context.configs.get(guild.id);
  const category = settings?.ticketCategoryId
    ? guild.channels.cache.get(settings.ticketCategoryId)
    : undefined;
  if (!settings || category?.type !== ChannelType.GuildCategory) {
    await interaction.reply({ content: OPEN_REPLIES.notConfigured, flags: MessageFlags.Ephemeral });
    return;
  }

  // Créer un salon prend parfois plus de 3 s : on répond « en cours » tout de suite
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const existing = await findOpenTicket(db, guild.id, member.id);
  if (existing) {
    if (guild.channels.cache.has(existing.channelId)) {
      await interaction.editReply(`Tu as déjà un ticket ouvert : <#${existing.channelId}>`);
      return;
    }
    // Salon supprimé pendant que le bot était éteint
    await closeTicket(db, existing.id, CLOSED_WITHOUT_TRANSCRIPT);
  }

  // Un rôle supprimé depuis le réglage ferait échouer toute la création
  const staffRoleIds = settings.ticketStaffRoleIds.filter((id) => guild.roles.cache.has(id));
  const number = await reserveTicketNumber(db, guild.id);

  let channel: TextChannel;
  try {
    channel = await guild.channels.create({
      name: ticketChannelName(number),
      type: ChannelType.GuildText,
      parent: category.id,
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
      await interaction.editReply(OPEN_REPLIES.missingPermissions);
      return;
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
    });
    await channel.send(welcomeMessage(ticket, staffRoleIds));
  } catch (err) {
    // Pas de salon fantôme : sans ligne en base, personne ne pourrait le fermer
    await channel.delete('Ticket non enregistré').catch(() => undefined);
    throw err;
  }

  logger.info({ guildId: guild.id, number }, 'Ticket ouvert');
  await interaction.editReply(`Ton ticket est ouvert : ${channel}`);
}

/**
 * Bouton « Ouvrir un ticket ». Le verrou en mémoire bloque le double-clic :
 * sans lui, deux clics rapprochés passeraient tous deux le test « déjà un ticket ouvert ».
 */
export function createOpenTicketButton(): ComponentHandler {
  const opening = new Set<string>();
  return {
    prefix: 'ticket:open',
    async execute(interaction, _id, context) {
      if (!interaction.isButton() || !interaction.inCachedGuild()) return;
      const key = `${interaction.guildId}:${interaction.user.id}`;
      if (opening.has(key)) {
        await interaction.reply({
          content: OPEN_REPLIES.inProgress,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      opening.add(key);
      try {
        await openTicket(interaction, context);
      } finally {
        opening.delete(key);
      }
    },
  };
}
