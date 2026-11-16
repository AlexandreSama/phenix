import { listXpMultipliers, type PrismaClient } from '@phenix/database';
import type { XpMultiplierEntry } from '@phenix/shared';

/** Les règles d'XP des serveurs (bonus par rôle, salon ou catégorie), gardées en mémoire. */
export interface XpRulesCache {
  /** Les bonus d'un serveur ; liste vide s'il n'en a pas. */
  getMultipliers(guildId: string): Promise<readonly XpMultiplierEntry[]>;
  /** Oublie un serveur : la prochaine lecture repassera par la base. */
  invalidate(guildId: string): void;
  /** Oublie tout, par exemple après une coupure de Valkey où des événements ont pu se perdre. */
  clear(): void;
}

/**
 * Évite une requête par message : les bonus ne changent que depuis le site, qui prévient le bot
 * (config.updated) ; la durée de vie courte rattrape un message perdu. Servira aussi à l'XP vocale (à venir).
 */
export function createXpRulesCache(
  db: Pick<PrismaClient, 'xpMultiplier'>,
  ttlMs = 60_000,
  now: () => number = Date.now,
): XpRulesCache {
  const entries = new Map<
    string,
    { value: Promise<readonly XpMultiplierEntry[]>; expiresAt: number }
  >();

  return {
    getMultipliers(guildId) {
      const entry = entries.get(guildId);
      if (entry && entry.expiresAt > now()) return entry.value;

      const value = listXpMultipliers(db, guildId);
      entries.set(guildId, { value, expiresAt: now() + ttlMs });
      // Une lecture ratée n'est pas gardée : la suivante réessaiera. Sauf si une lecture plus
      // récente l'a déjà remplacée (invalidate puis nouvelle lecture) : on ne l'efface pas.
      value.catch(() => {
        if (entries.get(guildId)?.value === value) entries.delete(guildId);
      });
      return value;
    },
    invalidate(guildId) {
      entries.delete(guildId);
    },
    clear() {
      entries.clear();
    },
  };
}
