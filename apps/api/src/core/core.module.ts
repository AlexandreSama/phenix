import {
  Global,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createPrismaClient, PrismaClient } from '@phenix/database';
import { Redis } from 'ioredis';
import type { Env } from '../env.js';
import { ENV } from './tokens.js';
import { DiscordService } from '../discord/discord.service.js';
import { SessionService } from '../modules/auth/session.service.js';
import { BotEventsService } from './bot-events.service.js';
import { CacheService } from './cache.service.js';
import { RateLimitService } from './rate-limit.service.js';

/** Ferme proprement la base et Valkey quand l'API s'arrête. */
@Injectable()
class ConnectionsShutdown implements OnApplicationShutdown {
  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.db.$disconnect(), this.redis.quit()]);
  }
}

/** Services partagés par toute l'API : config, base, Valkey, Discord, sessions. */
@Global()
@Module({})
export class CoreModule {
  static register(env: Env): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: ENV, useValue: env },
        { provide: PrismaClient, useFactory: () => createPrismaClient(env.DATABASE_URL) },
        { provide: Redis, useFactory: () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 }) },
        BotEventsService,
        CacheService,
        DiscordService,
        SessionService,
        ConnectionsShutdown,
        RateLimitService,
      ],
      exports: [
        ENV,
        PrismaClient,
        Redis,
        BotEventsService,
        CacheService,
        DiscordService,
        SessionService,
        RateLimitService,
      ],
    };
  }
}
