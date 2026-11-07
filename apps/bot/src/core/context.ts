import type { PrismaClient } from '@phenix/database';
import type { Logger } from '../logger.js';
import type { GuildConfigCache } from './guild-config-cache.js';

/** Ce que le bot fournit à chaque commande. Les tests en passent de faux. */
export interface BotContext {
  db: PrismaClient;
  logger: Logger;
  /** Réglages des serveurs, tenus à jour par le site via Valkey */
  configs: GuildConfigCache;
}
