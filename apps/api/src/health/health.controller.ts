import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from '@phenix/database';
import { Redis } from 'ioredis';

/** Utilisée par le healthcheck Docker : l'API répond, et joint la base et Valkey. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await Promise.all([this.db.$queryRaw`SELECT 1`, this.redis.ping()]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Base ou Valkey injoignable');
    }
  }
}
