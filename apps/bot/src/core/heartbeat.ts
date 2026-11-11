import { startLiveHeartbeat, type LiveStore, type ProcessMeter } from '@phenix/metrics';
import { METRICS, type ServiceHeartbeat } from '@phenix/shared';
import type { Client } from 'discord.js';
import type { Logger } from 'pino';

/** Ce que le battement de cœur lit du client Discord. */
export type HeartbeatClient = Pick<Client, 'isReady'> & {
  guilds: { cache: { size: number } };
  ws: { ping: number };
};

interface HeartbeatOptions {
  client: HeartbeatClient;
  store: LiveStore;
  logger: Pick<Logger, 'warn'>;
  meter: Pick<ProcessMeter, 'read'>;
  version: string;
  now?: () => Date;
}

/**
 * Publie l'état du bot maintenant, puis toutes les 30 secondes, tant qu'il est connecté à
 * Discord : CPU, RAM, serveurs, ping… L'API le lit pour /api/health/bot et la page Métriques.
 * Rend la fonction qui l'arrête.
 */
export function startHeartbeat({
  client,
  store,
  logger,
  meter,
  version,
  now = () => new Date(),
}: HeartbeatOptions): () => void {
  return startLiveHeartbeat({
    store,
    key: METRICS.live.keys.bot,
    intervalSeconds: METRICS.live.intervalSeconds,
    ttlSeconds: METRICS.live.ttlSeconds,
    read: async () => {
      // Déconnecté de Discord : on se tait, la clé expire et l'API le signale
      if (!client.isReady()) return null;
      const reading = await meter.read();
      const heartbeat: ServiceHeartbeat = {
        at: now().toISOString(),
        cpu: reading.cpu,
        memory: reading.memory,
        memoryLimit: reading.memoryLimit,
        uptime: reading.uptime,
        version,
        eventLoopDelayMs: reading.eventLoopDelayMs,
        guilds: client.guilds.cache.size,
        ping: client.ws.ping,
      };
      return heartbeat;
    },
    onError: (err) => logger.warn({ err }, 'Battement de cœur non écrit'),
  });
}
