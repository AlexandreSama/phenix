import { z } from 'zod';

/**
 * Les métriques des propriétaires du bot (phase 11) : un relevé toutes les 5 minutes, gardé
 * 30 jours, et un battement en direct de chaque service dans Valkey.
 */
export const METRICS = {
  /** Un relevé de CPU, RAM et stockage toutes les 5 minutes */
  sampleIntervalMs: 5 * 60_000,
  /** Relevés et compteurs de commandes plus vieux que ça : effacés une fois par jour */
  retentionDays: 30,
  /** Le bot écrit l'usage des commandes en base par lot, toutes les minutes */
  usageFlushMs: 60_000,
  /** Le battement de chaque service : réécrit toutes les 30 s, il expire au bout de 90 s */
  live: {
    intervalSeconds: 30,
    ttlSeconds: 90,
    keys: { bot: 'metrics:live:bot', api: 'metrics:live:api' },
  },
  /** Les réponses de /api/admin/metrics restent 30 s dans le cache */
  cacheSeconds: 30,
} as const;

export type MetricsService = keyof typeof METRICS.live.keys;

/** Les plages proposées par la page, et le pas de leurs courbes. */
export const METRICS_RANGES = {
  '24h': { label: '24 h', hours: 24, binMinutes: 5 },
  '7d': { label: '7 jours', hours: 7 * 24, binMinutes: 60 },
  '30d': { label: '30 jours', hours: 30 * 24, binMinutes: 240 },
} as const;

export type MetricsRange = keyof typeof METRICS_RANGES;
export const METRICS_RANGE_KEYS = Object.keys(METRICS_RANGES) as [MetricsRange, ...MetricsRange[]];

/**
 * Le battement d'un service : son état à l'instant. Les champs du bot (serveurs, ping) manquent
 * dans celui de l'API.
 */
export const serviceHeartbeatSchema = z.object({
  /** Date du battement (ISO 8601) */
  at: z.iso.datetime(),
  /** CPU utilisé depuis le battement précédent, en % des CPU permis au conteneur */
  cpu: z.number().nonnegative(),
  /** Mémoire utilisée, en octets */
  memory: z.number().nonnegative(),
  /** Limite de mémoire du conteneur, en octets ; null sans limite */
  memoryLimit: z.number().positive().nullable(),
  /** Depuis combien de secondes le processus tourne */
  uptime: z.number().nonnegative(),
  version: z.string(),
  /** Retard moyen de la boucle d'événements, en millisecondes */
  eventLoopDelayMs: z.number().nonnegative(),
  guilds: z.number().int().nonnegative().optional(),
  /** Latence de la passerelle Discord, en millisecondes ; -1 tant qu'elle n'est pas mesurée */
  ping: z.number().optional(),
});
export type ServiceHeartbeat = z.infer<typeof serviceHeartbeatSchema>;

/** Les noms des relevés : bot.cpu, api.memory, postgres.bytes, garage.media.objects… */
export const METRIC_NAME_PATTERN =
  /^(?:(?:bot|api)\.(?:cpu|memory)|postgres\.bytes|valkey\.bytes|garage\.[a-z0-9][a-z0-9.-]{0,62}\.(?:bytes|objects))$/;

const range = z.enum(METRICS_RANGE_KEYS).default('24h');

/** ?range=7d ; absente, c'est 24 h. */
export const metricsRangeQuerySchema = z.object({ range });
export type MetricsRangeQuery = z.infer<typeof metricsRangeQuerySchema>;

/** ?names=bot.cpu,api.cpu&range=7d : douze courbes au plus. */
export const metricsSeriesQuerySchema = z.object({
  names: z
    .string()
    .transform((value) => [...new Set(value.split(',').map((name) => name.trim()))])
    .pipe(
      z
        .array(z.string().regex(METRIC_NAME_PATTERN, 'Relevé inconnu'))
        .min(1, 'Au moins un relevé')
        .max(12, 'Douze relevés au plus'),
    ),
  range,
});
export type MetricsSeriesQuery = z.infer<typeof metricsSeriesQuerySchema>;
