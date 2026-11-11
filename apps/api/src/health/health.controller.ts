import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from '@phenix/database';
import { BOT_HEARTBEAT, botHeartbeatSchema, type BotHeartbeat } from '@phenix/shared';
import { Redis } from 'ioredis';

/** Le contenu d'une clé, ou undefined si elle manque ou ne contient pas du JSON. */
function parseJson(raw: string | null): unknown {
  try {
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
  ) {}

  /** Utilisée par le healthcheck Docker : l'API répond, et joint la base et Valkey. */
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await Promise.all([this.db.$queryRaw`SELECT 1`, this.redis.ping()]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Base ou Valkey injoignable');
    }
  }

  /**
   * Pour une surveillance externe : le bot a-t-il donné signe de vie depuis 90 secondes ?
   * À part de /api/health, pour qu'un bot en panne ne fasse pas redémarrer l'API.
   */
  @Get('bot')
  async bot(): Promise<{ status: 'ok' } & BotHeartbeat> {
    const raw = await this.redis.get(BOT_HEARTBEAT.key).catch(() => null);
    const heartbeat = botHeartbeatSchema.safeParse(parseJson(raw));
    if (!heartbeat.success) {
      throw new ServiceUnavailableException('Le bot ne donne plus signe de vie');
    }
    return { status: 'ok', ...heartbeat.data };
  }
}
