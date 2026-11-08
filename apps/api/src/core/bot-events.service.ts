import { Injectable, Logger } from '@nestjs/common';
import { BOT_EVENTS_CHANNEL, type BotEvent } from '@phenix/shared';
import { Redis } from 'ioredis';

/** Prévient le bot par Valkey (pub/sub) qu'un réglage a changé sur le site. */
@Injectable()
export class BotEventsService {
  private readonly logger = new Logger(BotEventsService.name);

  constructor(private readonly redis: Redis) {}

  /** Un échec n'annule pas l'enregistrement : le bot relit sa config sous 5 minutes. */
  async notify(event: BotEvent): Promise<void> {
    try {
      await this.redis.publish(BOT_EVENTS_CHANNEL, JSON.stringify(event));
    } catch (err) {
      this.logger.warn({ err, event }, 'Événement non publié sur Valkey');
    }
  }
}
