import type { PrismaClient } from '@phenix/database';
import type { Logger } from '../logger.js';
import type { GuildConfigCache } from './guild-config-cache.js';
import type { ObjectStorage } from '@phenix/storage';

/** Ce que le bot fournit à chaque commande. Les tests en passent de faux. */
export interface BotContext {
  db: PrismaClient;
  logger: Logger;
  /** Réglages des serveurs, tenus à jour par le site via Valkey */
  configs: GuildConfigCache;
  /** Adresse du site, sans / final ; absente si le site n'est pas déployé */
  publicUrl?: string;
  /** Bucket des transcripts de tickets, dans Garage */
  transcripts: ObjectStorage;
}
