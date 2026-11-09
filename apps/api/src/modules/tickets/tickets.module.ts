import { Module } from '@nestjs/common';
import { createTranscriptStorage } from '@phenix/storage';
import { ENV, TRANSCRIPTS } from '../../core/tokens.js';
import type { Env } from '../../env.js';
import { GuildsModule } from '../guilds/guilds.module.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  imports: [GuildsModule],
  controllers: [TicketsController],
  providers: [
    TicketsService,
    // Le client S3 est créé une fois ; les tests le remplacent par un faux
    { provide: TRANSCRIPTS, inject: [ENV], useFactory: (env: Env) => createTranscriptStorage(env) },
  ],
})
export class TicketsModule {}
