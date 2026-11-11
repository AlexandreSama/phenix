import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * Limite de débit par compte, comptée dans Valkey : partagée par toutes les instances de
 * l'API, et attachée à la personne plutôt qu'à son adresse IP.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: Redis) {}

  /** Compte une action. Au-delà de `limit` dans la fenêtre, répond 429 avec `message`. */
  async hit(key: string, limit: number, windowSeconds: number, message: string): Promise<void> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.incr(redisKey);
    // NX : la fenêtre démarre au premier compte, et se repose si elle avait été perdue
    await this.redis.expire(redisKey, windowSeconds, 'NX');
    if (count > limit) throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
