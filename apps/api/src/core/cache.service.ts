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

  /** Plusieurs valeurs d'un coup (un seul aller-retour) ; null pour une clé absente ou illisible. */
  async getMany<T>(keys: readonly string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const hits = await this.redis.mget(...keys);
    return hits.map((hit) => {
      if (!hit) return null;
      try {
        return JSON.parse(hit) as T;
      } catch {
        return null;
      }
    });
  }

  /** Garde la valeur `seconds` secondes. */
  async put(key: string, value: unknown, seconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', seconds);
  }
}
