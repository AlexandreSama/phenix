import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

/** Cache JSON dans Valkey, pour les réponses chères à recalculer (Discord, classements). */
@Injectable()
export class CacheService {
  constructor(private readonly redis: Redis) {}

  /** Lit la valeur, ou la calcule et la garde `seconds` secondes. */
  async wrap<T>(key: string, seconds: number, load: () => Promise<T>): Promise<T> {
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as T;
    const value = await load();
    await this.redis.set(key, JSON.stringify(value), 'EX', seconds);
    return value;
  }
}
