import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';
import type { SlashCommand } from '../../../core/command.js';
import type { BotContext } from '../../../core/context.js';
import { reasonOption, refuse } from '../common.js';
import { actionEmbed, sendModLog } from '../modlog.js';
import { auditReason } from '@phenix/shared';

const LOCKABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

/** Verrouillé = @everyone n'a plus le droit d'écrire, posé par /lock. */
export function isLocked(channel: TextChannel | NewsChannel): boolean {
  const overwrite = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
  return overwrite?.deny.has(PermissionFlagsBits.SendMessages) ?? false;
}

async function setLock(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
  lock: boolean,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const channel = interaction.options.getChannel('salon', false, LOCKABLE) ?? interaction.channel;
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    return refuse(interaction, "Choisis un salon textuel ou un salon d'annonces.");
  }
  // « Gérer les salons » peut être accordé salon par salon : le routeur ne contrôle que le salon où la
  // commande est tapée, pas celui qu'on vise
  if (!channel.permissionsFor(interaction.member).has(PermissionFlagsBits.ManageChannels)) {
    return refuse(interaction, 'Il te manque « Gérer les salons » dans ce salon.');
  }
  if (isLocked(channel) === lock) {
    return refuse(
      interaction,
      lock ? 'Ce salon est déjà verrouillé.' : "Ce salon n'est pas verrouillé.",
    );
  }

  const reason = interaction.options.getString('raison');
  // false = interdit ; null = retour au réglage hérité de la catégorie
  const value = lock ? false : null;
  await channel.permissionOverwrites.edit(
    interaction.guild.roles.everyone,
    {
      SendMessages: value,
      SendMessagesInThreads: value,
      CreatePublicThreads: value,
      CreatePrivateThreads: value,
    },
    { reason: auditReason(interaction.user.username, reason) },
  );

  const summary = lock ? `🔒 ${channel} est verrouillé.` : `🔓 ${channel} est déverrouillé.`;
  await interaction.reply(reason ? `${summary} Raison : ${reason}` : summary);
  await sendModLog(
    interaction.guild,
    actionEmbed(lock ? 'Salon verrouillé' : 'Salon déverrouillé', interaction.user, summary),
    context,
  );
}

const lockData = (name: string, description: string) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName('salon')
        .setDescription('Le salon (celui-ci par défaut)')
        .addChannelTypes(...LOCKABLE),
    )
    .addStringOption(reasonOption());

export const lockCommand: SlashCommand = {
  category: 'moderation',
  requiredPermissions: PermissionFlagsBits.ManageChannels,
  data: lockData('lock', "Empêche les membres d'écrire dans un salon"),
  execute: (interaction, context) => setLock(interaction, context, true),
};

export const unlockCommand: SlashCommand = {
  category: 'moderation',
  requiredPermissions: PermissionFlagsBits.ManageChannels,
  data: lockData('unlock', 'Rouvre un salon verrouillé par /lock'),
  execute: (interaction, context) => setLock(interaction, context, false),
};
