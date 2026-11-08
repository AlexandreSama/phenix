import { LEVELING_DEFAULTS } from '@phenix/shared';
import type { GuildSettings } from '../../core/guild-config-cache.js';

export type LevelingSettings = Pick<
    GuildSettings,
    'xpEnabled' | 'xpMin' | 'xpMax' | 'xpCooldownSec' | 'levelUpChannelId' | 'leaderboardPublic'
>;

/** Réglages XP d'un serveur ; ceux par défaut s'il n'a pas encore de config. */
export function levelingSettings(settings: GuildSettings | null): LevelingSettings {
  return settings ?? LEVELING_DEFAULTS;
}

/** Un gain au hasard entre min et max, bornes comprises. */
export function randomXp(min: number, max: number, random: () => number = Math.random): number {
  return min + Math.floor(random() * (max - min + 1));
}

export interface Cooldowns {
  /** Vrai si le membre peut gagner de l'XP maintenant ; le délai repart alors de zéro. */
  take(key: string, cooldownMs: number): boolean;
  readonly size: number;
}

/**
 * Délais entre deux gains, gardés en mémoire : la plupart des messages s'arrêtent ici,
 * sans requête. La base revérifie le délai, ce qui couvre un redémarrage du bot.
 */
export function createCooldowns(now: () => number = Date.now, sweepAbove = 10_000): Cooldowns {
  const until = new Map<string, number>();

  return {
    take(key, cooldownMs) {
      const time = now();
      if ((until.get(key) ?? 0) > time) return false;
      until.set(key, time + cooldownMs);
      // Sur un gros serveur, on fait le ménage des délais échus de temps en temps
      if (until.size > sweepAbove) {
        for (const [entry, end] of until) if (end <= time) until.delete(entry);
      }
      return true;
    },
    get size() {
      return until.size;
    },
  };
}