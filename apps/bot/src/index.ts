import { Events } from 'discord.js';
import { Redis } from 'ioredis';
import { prisma } from '@phenix/database';
import {
  createGiveawayQueue,
  createGiveawayScheduler,
  createGiveawayWorker,
  createMetricsQueue,
  createMetricsWorker,
  createTd2Queue,
  createTd2Scheduler,
  createTd2Worker,
  ensureMetricsSchedules,
} from '@phenix/jobs';
import { createProcessMeter } from '@phenix/metrics';
import { METRICS } from '@phenix/shared';
import {
  createEvidenceStorage,
  createGarageAdminFromEnv,
  createTranscriptStorage,
} from '@phenix/storage';
import { createClient, createShardDisconnectHandler } from './client.js';
import { commands, ownerCommands } from './commands.js';
import { createDbCommandUsageRecorder } from './core/command-usage.js';
import type { BotContext } from './core/context.js';
import { createGuildConfigCache } from './core/guild-config-cache.js';
import { startHeartbeat } from './core/heartbeat.js';
import { createInteractionHandler } from './core/interaction-router.js';
import { createCommandRegistry, createComponentRegistry } from './core/registry.js';
import { loadEnv } from './env.js';
import { subscribeToBotEvents } from './events/bot-events.js';
import { registerGuildEvents, syncGuilds } from './events/guilds.js';
import { logger } from './logger.js';
import { adminComponents } from './modules/admin/index.js';
import {
  createGiveawayProcessor,
  giveawayComponents,
  resumeGiveaways,
} from './modules/giveaways/index.js';
import { createMessageXpHandler, levelingComponents } from './modules/leveling/index.js';
import { createMetricsProcessor } from './modules/metrics/index.js';
import { startBanExpiry } from './modules/moderation/index.js';
import {
  createRolePanelPublisher,
  publishPendingRolePanels,
  roleComponents,
} from './modules/roles/index.js';
import {
  createTd2Processor,
  createTd2Stats,
  removeReportStaffMessage,
  resumeTd2Events,
  td2Components,
} from './modules/td2/index.js';
import {
  closeOrphanTickets,
  createTicketChannelDeleteHandler,
  createTicketPanelPublisher,
  publishPendingTicketPanels,
  ticketComponents,
} from './modules/tickets/index.js';
import {
  createMemberAddHandler,
  createMemberRemoveHandler,
  createMemberUpdateHandler,
  createWelcomeDeps,
} from './modules/welcome/index.js';

const env = loadEnv();
const client = createClient();
const configs = createGuildConfigCache(prisma);

// La file des giveaways : le bot y ajoute des tâches (comme l'API) et il est seul à les traiter
const giveawayQueue = createGiveawayQueue(env.REDIS_URL);
const giveawayWorker = createGiveawayWorker(
  env.REDIS_URL,
  createGiveawayProcessor({ client, db: prisma, logger }),
);
// Sans écouteur « error », une coupure de Valkey ferait planter le processus
giveawayQueue.on('error', (err) => logger.error({ err }, 'File des giveaways : erreur Valkey'));
giveawayWorker.on('error', (err) => logger.error({ err }, 'Worker des giveaways : erreur'));
giveawayWorker.on('failed', (job, err) =>
  logger.warn(
    { err, job: job?.name, data: job?.data, attempts: job?.attemptsMade },
    'Tâche en échec',
  ),
);

// La file des sorties TD2 : rappels et fermetures, à part pour ne pas attendre les giveaways
const td2Queue = createTd2Queue(env.REDIS_URL);
const td2Worker = createTd2Worker(
  env.REDIS_URL,
  createTd2Processor({ client, db: prisma, logger }),
);
td2Queue.on('error', (err) => logger.error({ err }, 'File TD2 : erreur Valkey'));
td2Worker.on('error', (err) => logger.error({ err }, 'Worker TD2 : erreur'));
td2Worker.on('failed', (job, err) =>
  logger.warn(
    { err, job: job?.name, data: job?.data, attempts: job?.attemptsMade },
    'Tâche TD2 en échec',
  ),
);

// Une connexion qui échoue vite plutôt que d'attendre Valkey : le cache des stats (sans lui, le bot
// interroge tracker.gg) et le battement de cœur (sans lui, /api/health/bot signale le bot absent)
const cache = new Redis(env.REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
cache.on('error', (err) => logger.warn({ err }, 'Cache et battement de cœur : erreur Valkey'));
if (!env.TRN_API_KEY) logger.warn('TRN_API_KEY absente : /td2 stats est désactivée');

// Les métriques des propriétaires (phase 11) : un relevé toutes les 5 minutes, planifié par
// BullMQ (une seule exécution même avec plusieurs instances), et le compte des commandes
const metricsQueue = createMetricsQueue(env.REDIS_URL);
const metricsWorker = createMetricsWorker(
  env.REDIS_URL,
  createMetricsProcessor({
    db: prisma,
    redis: cache,
    garage: createGarageAdminFromEnv(env),
    meter: createProcessMeter(),
    logger,
  }),
);
metricsQueue.on('error', (err) => logger.error({ err }, 'File des métriques : erreur Valkey'));
metricsWorker.on('error', (err) => logger.error({ err }, 'Worker des métriques : erreur'));
metricsWorker.on('failed', (job, err) =>
  logger.warn({ err, job: job?.name }, 'Relevé des métriques en échec'),
);
if (!env.GARAGE_ADMIN_URL || !env.GARAGE_ADMIN_TOKEN) {
  logger.warn('GARAGE_ADMIN_URL ou GARAGE_ADMIN_TOKEN absente : pas de relevé Garage');
}
const usage = createDbCommandUsageRecorder(prisma, { logger, intervalMs: METRICS.usageFlushMs });

const context: BotContext = {
  db: prisma,
  logger,
  configs,
  publicUrl: env.PUBLIC_URL?.replace(/\/$/, ''),
  transcripts: createTranscriptStorage(env),
  evidence: createEvidenceStorage(env),
  giveaways: createGiveawayScheduler(giveawayQueue),
  td2: createTd2Scheduler(td2Queue),
  stats: createTd2Stats({ apiKey: env.TRN_API_KEY, baseUrl: env.TRN_API_URL, cache }),
  ownerIds: env.BOT_OWNER_IDS,
};
const unsubscribe = subscribeToBotEvents(env.REDIS_URL, {
  configs,
  rolePanels: createRolePanelPublisher(client, prisma, logger),
  ticketPanels: createTicketPanelPublisher(client, prisma, logger),
  removeTd2Report: (event) => removeReportStaffMessage(client, configs, event, logger),
  logger,
});
let stopBanExpiry: (() => void) | undefined;
let stopHeartbeat: (() => void) | undefined;

client.on(
  Events.InteractionCreate,
  createInteractionHandler({
    commands: createCommandRegistry([...commands, ...ownerCommands]),
    components: createComponentRegistry([
      ...levelingComponents,
      ...roleComponents,
      ...ticketComponents,
      ...giveawayComponents,
      ...td2Components,
      ...adminComponents,
    ]),
    context,
    usage,
  }),
);

client.on(Events.MessageCreate, createMessageXpHandler(context));
client.on(Events.ChannelDelete, createTicketChannelDeleteHandler(prisma, logger));

// Bienvenue / au-revoir : arrivées, départs et fin de la vérification Discord (pending)
const welcome = createWelcomeDeps({ configs, logger });
client.on(Events.GuildMemberAdd, createMemberAddHandler(welcome));
client.on(Events.GuildMemberRemove, createMemberRemoveHandler(welcome));
client.on(Events.GuildMemberUpdate, createMemberUpdateHandler(welcome));

// Connexion fermée pour de bon par Discord (ex. 4014 : intent privilégié non activé)
client.on(Events.ShardDisconnect, createShardDisconnectHandler(logger));

client.once(Events.ClientReady, (ready) => {
  logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'Bot connecté');
  syncGuilds(prisma, [...ready.guilds.cache.values()])
    .then(() => logger.info('Serveurs synchronisés avec la base'))
    .catch((err: unknown) => logger.error({ err }, 'Échec de la synchronisation des serveurs'));
  stopBanExpiry = startBanExpiry(ready, context);
  stopHeartbeat = startHeartbeat({
    client: ready,
    store: cache,
    logger,
    meter: createProcessMeter(),
    version: env.APP_VERSION,
  });
  publishPendingRolePanels(ready, prisma, logger).catch((err: unknown) =>
    logger.error({ err }, 'Échec de la publication des panels en attente'),
  );
  publishPendingTicketPanels(ready, prisma, logger).catch((err: unknown) =>
    logger.error({ err }, 'Échec de la publication des panels de tickets'),
  );
  closeOrphanTickets(ready, prisma, logger).catch((err: unknown) =>
    logger.error({ err }, 'Échec du ménage des tickets sans salon'),
  );
  // Le worker ne prend des tâches qu'une fois connecté à Discord
  giveawayWorker
    .run()
    .catch((err: unknown) => logger.error({ err }, 'Worker des giveaways arrêté'));
  resumeGiveaways(ready, prisma, context.giveaways, logger).catch((err: unknown) =>
    logger.error({ err }, 'Échec de la reprise des giveaways'),
  );
  td2Worker.run().catch((err: unknown) => logger.error({ err }, 'Worker TD2 arrêté'));
  ensureMetricsSchedules(metricsQueue, METRICS.sampleIntervalMs).catch((err: unknown) =>
    logger.error({ err }, 'Échec de la planification des relevés'),
  );
  metricsWorker.run().catch((err: unknown) => logger.error({ err }, 'Worker des métriques arrêté'));
  resumeTd2Events(ready, prisma, context.td2, logger).catch((err: unknown) =>
    logger.error({ err }, 'Échec de la reprise des sorties TD2'),
  );
});

registerGuildEvents(client, prisma, logger);

process.on('unhandledRejection', (err) => logger.error({ err }, 'Promesse rejetée non gérée'));

/** Arrêt propre : Docker envoie SIGTERM, Ctrl+C envoie SIGINT. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Arrêt en cours');
  stopBanExpiry?.();
  stopHeartbeat?.();
  // Laisse finir la tâche en cours ; les autres attendent dans Valkey
  await giveawayWorker.close();
  await giveawayQueue.close();
  await td2Worker.close();
  await td2Queue.close();
  await metricsWorker.close();
  await metricsQueue.close();
  // Le dernier lot des commandes comptées, avant de fermer la base
  await usage.stop();
  await unsubscribe();
  cache.disconnect();
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await client.login(env.DISCORD_TOKEN);
