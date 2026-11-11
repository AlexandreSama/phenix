import { BOT_HEARTBEAT, type BotHeartbeat } from '@phenix/shared';
import type { Client } from 'discord.js';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

/** Ce que le battement de cœur lit du client Discord. */
export type HeartbeatClient = Pick<Client, 'isReady'> & {
  guilds: { cache: { size: number } };
  ws: { ping: number };
};

/**
 * Écrit le battement de cœur maintenant, puis toutes les 30 secondes, tant que le bot est
 * connecté à Discord. L'API le lit pour /api/health/bot. Rend la fonction qui l'arrête.
 */
export function startHeartbeat(
  client: HeartbeatClient,
  redis: Pick<Redis, 'set'>,
  logger: Pick<Logger, 'warn'>,
  now: () => Date = () => new Date(),
): () => void {
  const beat = () => {
    // Déconnecté de Discord : on se tait, la clé expire et l'API le signale
    if (!client.isReady()) return;
    const heartbeat: BotHeartbeat = {
      at: now().toISOString(),
      guilds: client.guilds.cache.size,
      ping: client.ws.ping,
    };
    redis
      .set(BOT_HEARTBEAT.key, JSON.stringify(heartbeat), 'EX', BOT_HEARTBEAT.ttlSeconds)
      .catch((err: unknown) => logger.warn({ err }, 'Battement de cœur non écrit'));
  };
  beat();
  const timer = setInterval(beat, BOT_HEARTBEAT.intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
