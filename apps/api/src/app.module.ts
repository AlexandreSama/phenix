import { Module, StandardSchemaValidationPipe, type DynamicModule } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { CoreModule } from './core/core.module.js';
import type { Env } from './env.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GuildConfigModule } from './modules/guild-config/guild-config.module.js';
import { GuildsModule } from './modules/guilds/guilds.module.js';
import { LevelingModule } from './modules/leveling/leveling.module.js';
import { RolePanelsModule } from './modules/role-panels/role-panels.module.js';
import { TicketsModule } from './modules/tickets/tickets.module.js';

@Module({})
export class AppModule {
  /** Le module reçoit l'environnement validé : les tests en passent un faux. */
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            // Les cookies de session ne doivent jamais apparaître dans les logs
            redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
            autoLogging: { ignore: (req) => req.url === '/api/health' },
            ...(env.NODE_ENV === 'development' && {
              transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
            }),
          },
        }),
        CoreModule.register(env),
        AuthModule,
        GuildsModule,
        GuildConfigModule,
        LevelingModule,
        RolePanelsModule,
        TicketsModule,
      ],
      controllers: [HealthController],
      // Valide chaque @Body({ schema }), @Query({ schema })… avec les schémas zod
      providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
    };
  }
}
