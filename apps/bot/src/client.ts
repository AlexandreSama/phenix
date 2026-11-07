import { Client, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';

/** Permissions demandées à l'invitation : de quoi faire tourner tous les modules prévus. */
export const BOT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
];

export function createClient(): Client {
  return new Client({
    // Aucun intent privilégié. GuildMessages arrivera en phase 5 pour l'XP.
    intents: [GatewayIntentBits.Guilds],
    // Jamais de @everyone ni de rôle mentionné par accident
    allowedMentions: { parse: ['users'] },
  });
}
