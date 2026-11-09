import { Inject, Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createGiveawayQueue, createGiveawayScheduler, type GiveawayQueue } from '@phenix/jobs';
import { ENV, GIVEAWAY_QUEUE, GIVEAWAYS } from '../../core/tokens.js';
import type { Env } from '../../env.js';
import { GuildsModule } from '../guilds/guilds.module.js';
import { GiveawaysController } from './giveaways.controller.js';
import { GiveawaysService } from './giveaways.service.js';

/** Ferme la connexion de la file quand l'API s'arrête. */
@Injectable()
class GiveawayQueueShutdown implements OnApplicationShutdown {
  constructor(@Inject(GIVEAWAY_QUEUE) private readonly queue: GiveawayQueue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}

function createQueue(env: Env): GiveawayQueue {
  const queue = createGiveawayQueue(env.REDIS_URL);
  // Sans écouteur « error », une coupure de Valkey ferait planter l'API
  const logger = new Logger('GiveawayQueue');
  queue.on('error', (err) => logger.error(`File des giveaways : ${err.message}`));
  return queue;
}

@Module({
  imports: [GuildsModule],
  controllers: [GiveawaysController],
  providers: [
    GiveawaysService,
    // L'API ajoute des tâches ; le worker du bot les traite. Les tests remplacent la file.
    { provide: GIVEAWAY_QUEUE, inject: [ENV], useFactory: createQueue },
    {
      provide: GIVEAWAYS,
      inject: [GIVEAWAY_QUEUE],
      useFactory: (queue: GiveawayQueue) => createGiveawayScheduler(queue),
    },
    GiveawayQueueShutdown,
  ],
})
export class GiveawaysModule {}
