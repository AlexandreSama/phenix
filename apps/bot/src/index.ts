import { Events } from 'discord.js';
import { prisma } from '@phenix/database';
import { createClient } from './client.js';
import { commands, ownerCommands } from './commands.js';
import type { BotContext } from './core/context.js';
import { createInteractionHandler } from './core/interaction-router.js';
import { createCommandRegistry, createComponentRegistry } from './core/registry.js';
import { loadEnv } from './env.js';
import { registerGuildEvents, syncGuilds } from './events/guilds.js';
import { logger } from './logger.js';
import { startBanExpiry } from './modules/moderation/index.js';
import { createGuildConfigCache } from './core/guild-config-cache.js';
import { subscribeToBotEvents } from './events/bot-events.js';
import { createMessageXpHandler, levelingComponents } from './modules/leveling/index.js';
import {
  createRolePanelPublisher,
  publishPendingRolePanels,
  roleComponents,
} from './modules/roles/index.js';
import { createTranscriptStorage } from '@phenix/storage';
import {
  closeOrphanTickets,
  createTicketChannelDeleteHandler,
  createTicketPanelPublisher,
  publishPendingTicketPanels,
  ticketComponents,
} from './modules/tickets/index.js';
import {
  createGiveawayProcessor,
  giveawayComponents,
  resumeGiveaways,
} from './modules/giveaways/index.js';
import { createGiveawayQueue, createGiveawayScheduler, createGiveawayWorker } from '@phenix/jobs';
import { adminComponents } from './modules/admin/index.js';

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

const context: BotContext = {
  db: prisma,
  logger,
  configs,
  publicUrl: env.PUBLIC_URL?.replace(/\/$/, ''),
  transcripts: createTranscriptStorage(env),
  giveaways: createGiveawayScheduler(giveawayQueue),
  ownerIds: env.BOT_OWNER_IDS,
};
const unsubscribe = subscribeToBotEvents(env.REDIS_URL, {
  configs,
  rolePanels: createRolePanelPublisher(client, prisma, logger),
  ticketPanels: createTicketPanelPublisher(client, prisma, logger),
  logger,
});

let stopBanExpiry: (() => void) | undefined;

client.on(
  Events.InteractionCreate,
  createInteractionHandler({
    commands: createCommandRegistry([...commands, ...ownerCommands]),
    components: createComponentRegistry([
      ...levelingComponents,
      ...roleComponents,
      ...ticketComponents,
      ...giveawayComponents,
      ...adminComponents,
    ]),
    context,
  }),
);

client.on(Events.MessageCreate, createMessageXpHandler(context));
client.on(Events.ChannelDelete, createTicketChannelDeleteHandler(prisma, logger));

client.once(Events.ClientReady, (ready) => {
  logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'Bot connecté');
  syncGuilds(prisma, [...ready.guilds.cache.values()])
    .then(() => logger.info('Serveurs synchronisés avec la base'))
    .catch((err: unknown) => logger.error({ err }, 'Échec de la synchronisation des serveurs'));
  stopBanExpiry = startBanExpiry(ready, context);
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
});

registerGuildEvents(client, prisma, logger);

process.on('unhandledRejection', (err) => logger.error({ err }, 'Promesse rejetée non gérée'));

/** Arrêt propre : Docker envoie SIGTERM, Ctrl+C envoie SIGINT. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Arrêt en cours');
  stopBanExpiry?.();
  // Laisse finir la tâche en cours ; les autres attendent dans Valkey
  await giveawayWorker.close();
  await giveawayQueue.close();
  await unsubscribe();
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await client.login(env.DISCORD_TOKEN);
