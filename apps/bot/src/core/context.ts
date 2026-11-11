import type { PrismaClient } from '@phenix/database';
import type { Logger } from '../logger.js';
import type { GuildConfigCache } from './guild-config-cache.js';
import type { ObjectStorage } from '@phenix/storage';
import type { GiveawayScheduler, Td2Scheduler } from '@phenix/jobs';
import type { Td2StatsProvider } from '../modules/td2/stats/index.js';

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
  /** Bucket des preuves des signalements TD2 */
  evidence: ObjectStorage;
  /** File des giveaways : publications, tirages, relances */
  giveaways: GiveawayScheduler;
  /** File des sorties TD2 : rappels et fermetures */
  td2: Td2Scheduler;
  /** Les stats de carrière TD2 (tracker.gg, derrière le cache Valkey) */
  stats: Td2StatsProvider;
  /** Les propriétaires du bot (BOT_OWNER_IDS) : eux seuls peuvent lancer /broadcast */
  ownerIds: readonly string[];
}
