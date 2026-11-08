import { Events } from 'discord.js';
import { prisma } from '@phenix/database';
import { createClient } from './client.js';
import { commands } from './commands.js';
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

const env = loadEnv();
const client = createClient();
const configs = createGuildConfigCache(prisma);
const context: BotContext = {
  db: prisma,
  logger,
  configs,
  publicUrl: env.PUBLIC_URL?.replace(/\/$/, ''),
};
const unsubscribe = subscribeToBotEvents(env.REDIS_URL, {
  configs,
  rolePanels: createRolePanelPublisher(client, prisma, logger),
  logger,
});
let stopBanExpiry: (() => void) | undefined;

client.on(
  Events.InteractionCreate,
  createInteractionHandler({
    commands: createCommandRegistry(commands),
    components: createComponentRegistry([...levelingComponents, ...roleComponents]),
    context,
  }),
);

client.on(Events.MessageCreate, createMessageXpHandler(context));

client.once(Events.ClientReady, (ready) => {
  logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'Bot connecté');
  syncGuilds(prisma, [...ready.guilds.cache.values()])
    .then(() => logger.info('Serveurs synchronisés avec la base'))
    .catch((err: unknown) => logger.error({ err }, 'Échec de la synchronisation des serveurs'));
  stopBanExpiry = startBanExpiry(ready, context);
  publishPendingRolePanels(ready, prisma, logger).catch((err: unknown) =>
    logger.error({ err }, 'Échec de la publication des panels en attente'),
  );
});

registerGuildEvents(client, prisma, logger);

process.on('unhandledRejection', (err) => logger.error({ err }, 'Promesse rejetée non gérée'));

/** Arrêt propre : Docker envoie SIGTERM, Ctrl+C envoie SIGINT. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Arrêt en cours');
  stopBanExpiry?.();
  await unsubscribe();
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await client.login(env.DISCORD_TOKEN);
