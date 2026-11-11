import {
  databaseStats,
  purgeMetrics,
  recordMetricSamples,
  type PrismaClient,
} from '@phenix/database';
import type { MetricsJob } from '@phenix/jobs';
import { parseInfoField, slotStart, type ProcessMeter } from '@phenix/metrics';
import { METRICS } from '@phenix/shared';
import type { GarageAdmin } from '@phenix/storage';
import type { Logger } from 'pino';

interface MetricsDeps {
  db: Pick<PrismaClient, '$queryRaw' | 'metricSample' | 'commandUsage'>;
  /** Valkey : sa mémoire (INFO memory) */
  redis: { info(section: 'memory'): Promise<string> };
  /** Absent sans GARAGE_ADMIN_URL / GARAGE_ADMIN_TOKEN : pas de relevé Garage */
  garage?: GarageAdmin;
  /** Le processus du bot, mesuré d'un relevé à l'autre */
  meter: Pick<ProcessMeter, 'read'>;
  logger: Pick<Logger, 'info' | 'warn'>;
}

type Sample = { name: string; value: number };

const DAY = 24 * 3600_000;

/**
 * Traite la file des métriques. `sample` : le bot et le stockage, toutes les 5 minutes. Une
 * source en panne (Garage, Valkey…) n'empêche pas d'enregistrer les autres. `purge` : efface ce
 * qui dépasse 30 jours.
 */
export function createMetricsProcessor({ db, redis, garage, meter, logger }: MetricsDeps) {
  const sources: Record<string, () => Promise<Sample[]>> = {
    bot: async () => {
      const reading = await meter.read();
      return [
        { name: 'bot.cpu', value: reading.cpu },
        { name: 'bot.memory', value: reading.memory },
      ];
    },
    postgres: async () => [{ name: 'postgres.bytes', value: (await databaseStats(db)).bytes }],
    valkey: async () => {
      const used = parseInfoField(await redis.info('memory'), 'used_memory');
      if (used === null) throw new Error('INFO memory sans used_memory');
      return [{ name: 'valkey.bytes', value: used }];
    },
    ...(garage && {
      garage: async () =>
        (await garage.bucketStats()).flatMap((bucket) => [
          { name: `garage.${bucket.name}.bytes`, value: bucket.bytes },
          { name: `garage.${bucket.name}.objects`, value: bucket.objects },
        ]),
    }),
  };

  return async (job: MetricsJob): Promise<void> => {
    if (job.name === 'purge') {
      const before = new Date(job.scheduledAt.getTime() - METRICS.retentionDays * DAY);
      const removed = await purgeMetrics(db, before);
      logger.info({ ...removed, before }, 'Métriques de plus de 30 jours effacées');
      return;
    }

    const takenAt = slotStart(job.scheduledAt, METRICS.sampleIntervalMs);
    const names = Object.keys(sources);
    const results = await Promise.allSettled(names.map((name) => sources[name]!()));
    const samples: Sample[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') samples.push(...result.value);
      else logger.warn({ err: result.reason, source: names[index] }, 'Relevé impossible');
    });
    await recordMetricSamples(
      db,
      samples.map((sample) => ({ ...sample, takenAt })),
    );
  };
}
