import { Injectable } from '@nestjs/common';
import {
  commandDailyTotals,
  commandRanking,
  commandTotals,
  databaseStats,
  guildRanking,
  latestStorageSamples,
  metricSeries,
  PrismaClient,
} from '@phenix/database';
import { parseInfoField } from '@phenix/metrics';
import {
  METRICS,
  METRICS_RANGE_KEYS,
  METRICS_RANGES,
  serviceHeartbeatSchema,
  type CommandMetrics,
  type GuildMetrics,
  type MetricSeries,
  type MetricsOverview,
  type MetricsRange,
  type MetricsService,
  type ServiceStatus,
  type StorageBucket,
} from '@phenix/shared';
import { Redis } from 'ioredis';
import { CacheService } from '../../core/cache.service.js';
import { guildIconUrl } from '../../discord/cdn.js';

const HOUR = 3600_000;

/**
 * Le début d'une plage de compteurs (heure par heure) : l'heure en cours et les précédentes,
 * 24 heures en tout pour « 24 h ».
 */
export function usageSince(range: MetricsRange, now: Date): Date {
  const hour = Math.floor(now.getTime() / HOUR) * HOUR;
  return new Date(hour - (METRICS_RANGES[range].hours - 1) * HOUR);
}

/** Le contenu d'une clé, ou undefined si elle manque ou ne contient pas du JSON. */
function parseJson(raw: string | null): unknown {
  try {
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Les métriques des propriétaires du bot. Chaque réponse reste 30 s dans le cache. */
@Injectable()
export class AdminMetricsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
    private readonly cache: CacheService,
  ) {}

  /** Le service a-t-il publié son battement depuis 90 secondes ? */
  async status(service: MetricsService): Promise<ServiceStatus> {
    const raw = await this.redis.get(METRICS.live.keys[service]).catch(() => null);
    const heartbeat = serviceHeartbeatSchema.safeParse(parseJson(raw));
    return heartbeat.success ? { online: true, heartbeat: heartbeat.data } : { online: false };
  }

  overview(now = new Date()): Promise<MetricsOverview> {
    return this.cache.wrap('metrics:cache:overview', METRICS.cacheSeconds, async () => {
      const [bot, api, totals, database, valkey, garage] = await Promise.all([
        this.status('bot'),
        this.status('api'),
        Promise.all(
          METRICS_RANGE_KEYS.map((range) => commandTotals(this.db, usageSince(range, now))),
        ),
        databaseStats(this.db).catch(() => null),
        this.redis.info('memory').catch(() => null),
        latestStorageSamples(this.db),
      ]);
      const maxBytes = valkey === null ? null : parseInfoField(valkey, 'maxmemory');
      return {
        services: { bot, api },
        commands: Object.fromEntries(
          METRICS_RANGE_KEYS.map((range, index) => [range, totals[index]!]),
        ) as MetricsOverview['commands'],
        storage: {
          takenAt: garage.takenAt,
          postgres: { bytes: database?.bytes ?? null, tables: database?.tables ?? [] },
          valkey: {
            bytes: valkey === null ? null : parseInfoField(valkey, 'used_memory'),
            // 0 : Valkey n'a pas de plafond
            maxBytes: maxBytes ? maxBytes : null,
          },
          garage: bucketsOf(garage.samples),
        },
      };
    });
  }

  commands(range: MetricsRange, now = new Date()): Promise<CommandMetrics> {
    return this.cache.wrap(`metrics:cache:commands:${range}`, METRICS.cacheSeconds, async () => {
      const since = usageSince(range, now);
      const [commands, daily] = await Promise.all([
        commandRanking(this.db, since),
        commandDailyTotals(this.db, since),
      ]);
      return { range, commands, daily };
    });
  }

  guilds(range: MetricsRange, now = new Date()): Promise<GuildMetrics> {
    return this.cache.wrap(`metrics:cache:guilds:${range}`, METRICS.cacheSeconds, async () => {
      const rows = await guildRanking(this.db, usageSince(range, now));
      return {
        range,
        guilds: rows.map(({ icon, ...row }) => ({ ...row, iconUrl: guildIconUrl(row.id, icon) })),
      };
    });
  }

  series(names: string[], range: MetricsRange, now = new Date()): Promise<MetricSeries> {
    const key = `metrics:cache:series:${range}:${[...names].sort().join(',')}`;
    return this.cache.wrap(key, METRICS.cacheSeconds, async () => {
      const { hours, binMinutes } = METRICS_RANGES[range];
      const since = new Date(now.getTime() - hours * HOUR);
      return { range, binMinutes, series: await metricSeries(this.db, names, since, binMinutes) };
    });
  }
}

/** garage.<bucket>.bytes et garage.<bucket>.objects, regroupés par bucket. */
function bucketsOf(samples: { name: string; value: number }[]): StorageBucket[] {
  const buckets = new Map<string, StorageBucket>();
  for (const { name, value } of samples) {
    const match = /^garage\.(.+)\.(bytes|objects)$/.exec(name);
    if (!match) continue;
    const [, bucket = '', field] = match;
    const entry = buckets.get(bucket) ?? { name: bucket, bytes: 0, objects: 0 };
    entry[field as 'bytes' | 'objects'] = value;
    buckets.set(bucket, entry);
  }
  return [...buckets.values()];
}
