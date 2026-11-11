import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient, recordMetricSamples } from '@phenix/database';
import {
  createProcessMeter,
  slotStart,
  startLiveHeartbeat,
  type ProcessMeter,
} from '@phenix/metrics';
import { METRICS, type ServiceHeartbeat } from '@phenix/shared';
import { Redis } from 'ioredis';
import { ENV } from '../../core/tokens.js';
import type { Env } from '../../env.js';

/**
 * L'API se mesure elle-même : son battement toutes les 30 s dans Valkey (`metrics:live:api`),
 * et un relevé de CPU et de RAM toutes les 5 minutes, aligné sur le créneau. Avec plusieurs
 * instances, le premier relevé d'un créneau est gardé, les autres ignorés.
 */
@Injectable()
export class MetricsReporterService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MetricsReporterService.name);
  private readonly stops: (() => void)[] = [];

  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    // Les tests de l'application appellent start() eux-mêmes, avec de fausses mesures
    if (this.env.NODE_ENV === 'test') return;
    this.start(createProcessMeter(), createProcessMeter());
  }

  onModuleDestroy(): void {
    for (const stop of this.stops.splice(0)) stop();
  }

  /** `live` mesure d'un battement à l'autre, `sampler` d'un relevé à l'autre. */
  start(live: ProcessMeter, sampler: ProcessMeter, now: () => Date = () => new Date()): void {
    this.stops.push(
      startLiveHeartbeat({
        store: this.redis,
        key: METRICS.live.keys.api,
        intervalSeconds: METRICS.live.intervalSeconds,
        ttlSeconds: METRICS.live.ttlSeconds,
        read: () => this.heartbeat(live, now()),
        onError: (err) => this.logger.warn(`Battement non écrit : ${String(err)}`),
      }),
      () => live.stop(),
      () => sampler.stop(),
    );

    const timer = setInterval(() => {
      this.sample(sampler, now()).catch((err: unknown) =>
        this.logger.warn(`Relevé non écrit : ${String(err)}`),
      );
    }, METRICS.sampleIntervalMs);
    timer.unref();
    this.stops.push(() => clearInterval(timer));
  }

  async heartbeat(meter: Pick<ProcessMeter, 'read'>, at: Date): Promise<ServiceHeartbeat> {
    const reading = await meter.read();
    return {
      at: at.toISOString(),
      cpu: reading.cpu,
      memory: reading.memory,
      memoryLimit: reading.memoryLimit,
      uptime: reading.uptime,
      version: this.env.APP_VERSION,
      eventLoopDelayMs: reading.eventLoopDelayMs,
    };
  }

  async sample(meter: Pick<ProcessMeter, 'read'>, at: Date): Promise<void> {
    const reading = await meter.read();
    const takenAt = slotStart(at, METRICS.sampleIntervalMs);
    await recordMetricSamples(this.db, [
      { name: 'api.cpu', takenAt, value: reading.cpu },
      { name: 'api.memory', takenAt, value: reading.memory },
    ]);
  }
}
