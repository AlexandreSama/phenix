import {
  Client,
  GatewayCloseCodes,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
} from 'discord.js';
import type { Logger } from './logger.js';

/** Permissions demandées à l'invitation : de quoi faire tourner tous les modules prévus. */
export const BOT_PERMISSIONS = [
  // Le site crée les invitations des serveurs listés sur la page publique des sorties
  PermissionFlagsBits.CreateInstantInvite,
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
    // GuildMessages : l'XP compte les messages.
    // MessageContent (privilégié) : le transcript d'un ticket recopie le texte de ses messages.
    // GuildMembers (privilégié) : arrivées, départs et fin de la vérification (module welcome).
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    // Un membre absent du cache qui part arrive partiel : son départ s'annonce quand même
    partials: [Partials.GuildMember],
    // Jamais de @everyone ni de rôle mentionné par accident
    allowedMentions: { parse: ['users'] },
  });
}

/**
 * Discord ferme la connexion pour de bon (mauvais jeton, intent refusé…) : discord.js ne
 * réessaie pas. Le cas 4014 (intent privilégié non activé dans le portail) est expliqué en clair.
 */
export function createShardDisconnectHandler(logger: Pick<Logger, 'fatal' | 'error'>) {
  return ({ code }: { code: number }, shardId: number): void => {
    if (code === GatewayCloseCodes.DisallowedIntents) {
      logger.fatal(
        { code, shardId },
        'Discord refused the connection (4014): a privileged intent is not enabled. ' +
          'Enable "Server Members Intent" and "Message Content Intent" for the bot ' +
          'in the Discord Developer Portal (Bot tab), then restart the bot.',
      );
      return;
    }
    logger.error({ code, shardId }, 'Discord closed the gateway connection for good');
  };
}
