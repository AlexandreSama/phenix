import { BOT_EVENTS_CHANNEL, parseBotEvent } from '@phenix/shared';
import { Redis } from 'ioredis';
import type { GuildConfigCache } from '../core/guild-config-cache.js';
import type { Logger } from '../logger.js';
import type { RolePanelPublisher } from '../modules/roles/index.js';

interface Deps {
  configs: GuildConfigCache;
  rolePanels: RolePanelPublisher;
  logger: Pick<Logger, 'info' | 'warn' | 'debug'>;
}

// Giveaways, panel de tickets : leurs modules arrivent dans les phases 6.2 et 6.3
export function handleBotEvent(raw: string, { configs, rolePanels, logger }: Deps): void {
  const event = parseBotEvent(raw);
  if (!event) {
    logger.warn({ raw }, 'Événement Valkey ignoré : format inconnu');
    return;
  }

  switch (event.type) {
    case 'config.updated':
      configs.invalidate(event.guildId);
      logger.info({ guildId: event.guildId }, 'Config du serveur mise à jour depuis le site');
      return;
    // Les publications passent par Discord : on ne les attend pas, et une erreur reste dans les logs
    case 'rolePanel.publish':
      rolePanels.publish(event.panelId).catch((err: unknown) => {
        logger.warn({ err, panelId: event.panelId }, 'Publication du panel en échec');
      });
      return;
    case 'rolePanel.delete':
      rolePanels.remove(event).catch((err: unknown) => {
        logger.warn({ err, messageId: event.messageId }, 'Retrait du panel en échec');
      });
      return;
    default:
      // Panels, giveaways… : leurs modules arrivent dans les phases suivantes
      logger.debug({ type: event.type }, 'Événement pas encore géré');
  }
}

/**
 * S'abonne au canal de l'API. ioredis se reconnecte et se réabonne seul après une coupure ;
 * on vide alors le cache, car les messages envoyés pendant la coupure sont perdus.
 * Renvoie la fonction qui ferme l'abonnement.
 */
export function subscribeToBotEvents(redisUrl: string, deps: Deps): () => Promise<void> {
  const subscriber = new Redis(redisUrl);
  let connectedOnce = false;

  subscriber.on('ready', () => {
    if (connectedOnce) {
      deps.configs.clear();
      deps.logger.info('Valkey de retour : cache des configs vidé');
    }
    connectedOnce = true;
  });
  subscriber.on('error', (err) => deps.logger.warn({ err }, 'Valkey injoignable, nouvel essai…'));
  subscriber.on('message', (_channel, message: string) => handleBotEvent(message, deps));
  subscriber
    .subscribe(BOT_EVENTS_CHANNEL)
    .catch((err: unknown) => deps.logger.warn({ err }, 'Abonnement à Valkey impossible'));

  return async () => {
    await subscriber.quit();
  };
}
