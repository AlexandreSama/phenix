import { randomUUID } from 'node:crypto';
import { findAnnounceChannels, type AnnounceTarget } from '@phenix/database';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputStyle,
  type Client,
  type EmbedBuilder,
} from 'discord.js';
import type { ComponentHandler, SlashCommand } from '../../core/command.js';
import { buildCustomId } from '../../core/custom-id.js';
import { baseEmbed } from '../../core/embeds.js';
import { describePublishError, PublishError } from '../../core/publish.js';
import type { Logger } from '../../logger.js';

export const BROADCAST_LIMITS = { title: 256, message: 4000 } as const;

/** Le temps de relire l'aperçu avant de confirmer. */
export const PENDING_TTL_MS = 10 * 60_000;

/** Au-delà, le compte rendu résume : un message Discord fait 2000 caractères au plus. */
const MAX_LISTED_FAILURES = 10;

export const COMPOSE_CUSTOM_ID = buildCustomId('broadcast', 'compose');
export const sendCustomId = (key: string) => buildCustomId('broadcast', 'send', key);
export const cancelCustomId = (key: string) => buildCustomId('broadcast', 'cancel', key);

export const BROADCAST_REPLIES = {
  ownerOnly: 'Commande réservée aux propriétaires du bot.',
  expired: 'Cette annonce a expiré : relance /broadcast.',
  cancelled: 'Annonce annulée.',
  noTarget: "Aucun serveur n'a choisi de salon d'annonces : rien à envoyer.",
} as const;

export interface BroadcastDraft {
  title: string | null;
  message: string;
}

export interface BroadcastReport {
  sent: number;
  failures: { guild: string; reason: string }[];
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

export function broadcastEmbed(draft: BroadcastDraft, botName: string): EmbedBuilder {
  return baseEmbed()
    .setTitle(draft.title ?? '📣 Annonce')
    .setDescription(draft.message)
    .setFooter({ text: `Annonce de l'équipe de ${botName}` });
}

/**
 * Envoie l'annonce serveur après serveur. discord.js respecte seul les limites de débit
 * de Discord ; un serveur en échec n'arrête pas les autres.
 */
export async function sendBroadcast(
  client: Client,
  targets: AnnounceTarget[],
  embed: EmbedBuilder,
  logger: Pick<Logger, 'warn'>,
): Promise<BroadcastReport> {
  const report: BroadcastReport = { sent: 0, failures: [] };
  for (const target of targets) {
    try {
      const channel = await client.channels.fetch(target.channelId);
      if (!channel?.isSendable() || !('guildId' in channel) || channel.guildId !== target.guildId) {
        throw new PublishError("Salon d'annonces introuvable");
      }
      // Une annonce ne mentionne personne : ni @everyone, ni rôle, ni membre
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      report.sent++;
    } catch (err) {
      logger.warn({ err, guildId: target.guildId }, 'Annonce non envoyée');
      report.failures.push({
        guild: client.guilds.cache.get(target.guildId)?.name ?? target.guildId,
        reason: describePublishError(err),
      });
    }
  }
  return report;
}

export function formatReport({ sent, failures }: BroadcastReport): string {
  const lines = [`Annonce envoyée dans ${plural(sent, 'serveur')}.`];
  if (failures.length > 0) {
    lines.push(`Échecs (${failures.length}) :`);
    for (const failure of failures.slice(0, MAX_LISTED_FAILURES)) {
      lines.push(`- ${failure.guild} : ${failure.reason}`);
    }
    if (failures.length > MAX_LISTED_FAILURES) {
      lines.push(`… et ${failures.length - MAX_LISTED_FAILURES} autres (voir les logs du bot)`);
    }
  }
  return lines.join('\n');
}

function composeModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(COMPOSE_CUSTOM_ID)
    .setTitle('Annonce à tous les serveurs')
    .addLabelComponents(
      (label) =>
        label
          .setLabel('Titre')
          .setDescription('Facultatif : « 📣 Annonce » par défaut')
          .setTextInputComponent((input) =>
            input
              .setCustomId('title')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(BROADCAST_LIMITS.title),
          ),
      (label) =>
        label
          .setLabel('Message')
          .setTextInputComponent((input) =>
            input
              .setCustomId('message')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(BROADCAST_LIMITS.message),
          ),
    );
}

const ownerOnly = { content: BROADCAST_REPLIES.ownerOnly, flags: MessageFlags.Ephemeral } as const;

/**
 * /broadcast : réservé aux propriétaires du bot (BOT_OWNER_IDS), enregistré seulement sur
 * le serveur de test. Trois temps : un formulaire, un aperçu avec « Envoyer » / « Annuler »,
 * puis l'envoi et son compte rendu. Le brouillon attend la confirmation en mémoire.
 */
export function createBroadcast({
  now = Date.now,
  newKey = () => randomUUID().slice(0, 8),
}: { now?: () => number; newKey?: () => string } = {}): {
  command: SlashCommand;
  components: ComponentHandler[];
} {
  const drafts = new Map<string, BroadcastDraft & { expiresAt: number }>();

  /** Lit et retire le brouillon : un double clic sur « Envoyer » n'envoie qu'une fois. */
  const take = (key: string | undefined) => {
    if (!key) return undefined;
    const draft = drafts.get(key);
    drafts.delete(key);
    return draft && draft.expiresAt > now() ? draft : undefined;
  };

  const command: SlashCommand = {
    category: 'admin',
    data: new SlashCommandBuilder()
      .setName('broadcast')
      .setDescription('Envoie une annonce dans le salon d’annonces de chaque serveur')
      .setContexts(InteractionContextType.Guild)
      // Cachée aux membres du serveur de test ; seuls les propriétaires peuvent s'en servir
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, context) {
      if (!context.ownerIds.includes(interaction.user.id)) {
        await interaction.reply(ownerOnly);
        return;
      }
      await interaction.showModal(composeModal());
    },
  };

  const compose: ComponentHandler = {
    prefix: COMPOSE_CUSTOM_ID,
    async execute(interaction, _id, { db, ownerIds }) {
      if (!interaction.isModalSubmit()) return;
      if (!ownerIds.includes(interaction.user.id)) {
        await interaction.reply(ownerOnly);
        return;
      }
      const draft: BroadcastDraft = {
        title: interaction.fields.getTextInputValue('title').trim() || null,
        message: interaction.fields.getTextInputValue('message').trim(),
      };
      for (const [key, value] of drafts) if (value.expiresAt <= now()) drafts.delete(key);
      const key = newKey();
      drafts.set(key, { ...draft, expiresAt: now() + PENDING_TTL_MS });

      const targets = await findAnnounceChannels(db, [...interaction.client.guilds.cache.keys()]);
      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(sendCustomId(key))
          .setLabel(`Envoyer (${plural(targets.length, 'serveur')})`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(targets.length === 0),
        new ButtonBuilder()
          .setCustomId(cancelCustomId(key))
          .setLabel('Annuler')
          .setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({
        content:
          targets.length === 0
            ? BROADCAST_REPLIES.noTarget
            : `Aperçu. L'annonce partira dans le salon d'annonces de ${plural(targets.length, 'serveur')}.`,
        embeds: [broadcastEmbed(draft, interaction.client.user.username)],
        components: [buttons],
        flags: MessageFlags.Ephemeral,
      });
    },
  };

  const send: ComponentHandler = {
    prefix: 'broadcast:send',
    async execute(interaction, key, { db, logger, ownerIds }) {
      if (!interaction.isButton()) return;
      if (!ownerIds.includes(interaction.user.id)) {
        await interaction.reply(ownerOnly);
        return;
      }
      const draft = take(key);
      if (!draft) {
        await interaction.update({
          content: BROADCAST_REPLIES.expired,
          embeds: [],
          components: [],
        });
        return;
      }
      const { client } = interaction;
      const targets = await findAnnounceChannels(db, [...client.guilds.cache.keys()]);
      if (targets.length === 0) {
        await interaction.update({
          content: BROADCAST_REPLIES.noTarget,
          embeds: [],
          components: [],
        });
        return;
      }

      await interaction.update({
        content: `Envoi en cours dans ${plural(targets.length, 'serveur')}…`,
        components: [],
      });
      const report = await sendBroadcast(
        client,
        targets,
        broadcastEmbed(draft, client.user.username),
        logger,
      );
      logger.info({ sent: report.sent, failed: report.failures.length }, 'Annonce envoyée');
      await interaction.editReply({ content: formatReport(report) });
    },
  };

  const cancel: ComponentHandler = {
    prefix: 'broadcast:cancel',
    async execute(interaction, key) {
      if (!interaction.isButton()) return;
      take(key);
      await interaction.update({
        content: BROADCAST_REPLIES.cancelled,
        embeds: [],
        components: [],
      });
    },
  };

  return { command, components: [compose, send, cancel] };
}
