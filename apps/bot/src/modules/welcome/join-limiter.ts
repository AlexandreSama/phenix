/**
 * Freins du module welcome, en mémoire (rien n'est stocké par membre en base) :
 * - par serveur, une fenêtre glissante contre les raids (au-delà, plus de message) ;
 * - par membre, une pause entre deux annonces (quelqu'un qui part et revient en boucle).
 * Les deux tables sont bornées : un raid ne peut pas faire grossir la mémoire sans fin.
 */

/** Supprime les plus anciennes entrées (ordre d'insertion d'une Map) jusqu'à passer sous la borne. */
function evictOldest(map: Map<string, unknown>, maxKeys: number): void {
  for (const key of map.keys()) {
    if (map.size < maxKeys) return;
    map.delete(key);
  }
}

export interface RateDecision {
  allowed: boolean;
  /** Vrai une seule fois par fenêtre de dépassement : de quoi journaliser sans inonder les logs */
  warn: boolean;
}

export interface GuildRateLimiter {
  take(guildId: string): RateDecision;
  readonly size: number;
}

export interface GuildRateLimiterOptions {
  max: number;
  windowMs: number;
  now?: () => number;
  /** Nombre de serveurs suivis au plus */
  maxKeys?: number;
}

/** Au plus `max` passages par serveur sur les `windowMs` dernières millisecondes. */
export function createGuildRateLimiter({
  max,
  windowMs,
  now = Date.now,
  maxKeys = 10_000,
}: GuildRateLimiterOptions): GuildRateLimiter {
  const entries = new Map<string, { hits: number[]; warnedAt?: number }>();

  const isOver = (entry: { hits: number[]; warnedAt?: number }, time: number) =>
    entry.hits.every((hit) => hit <= time - windowMs) &&
    (entry.warnedAt === undefined || time - entry.warnedAt >= windowMs);

  return {
    take(guildId) {
      const time = now();
      let entry = entries.get(guildId);
      if (!entry) {
        if (entries.size >= maxKeys) {
          for (const [key, other] of entries) if (isOver(other, time)) entries.delete(key);
          evictOldest(entries, maxKeys);
        }
        entry = { hits: [] };
        entries.set(guildId, entry);
      }

      entry.hits = entry.hits.filter((hit) => hit > time - windowMs);
      if (entry.hits.length < max) {
        entry.hits.push(time);
        return { allowed: true, warn: false };
      }
      const warn = entry.warnedAt === undefined || time - entry.warnedAt >= windowMs;
      if (warn) entry.warnedAt = time;
      return { allowed: false, warn };
    },
    get size() {
      return entries.size;
    },
  };
}

export type AnnouncementKind = 'welcome' | 'goodbye';

export interface MemberPause {
  /** Vrai si l'annonce peut partir ; la pause démarre alors. Jamais journalisé. */
  take(kind: AnnouncementKind, guildId: string, userId: string): boolean;
  readonly size: number;
}

export interface MemberPauseOptions {
  ttlMs: number;
  now?: () => number;
  maxKeys?: number;
}

/** Une annonce d'arrivée et une de départ par membre et par serveur toutes les `ttlMs`. */
export function createMemberPause({
  ttlMs,
  now = Date.now,
  maxKeys = 10_000,
}: MemberPauseOptions): MemberPause {
  const until = new Map<string, number>();

  return {
    take(kind, guildId, userId) {
      const time = now();
      const key = `${kind}:${guildId}:${userId}`;
      if ((until.get(key) ?? 0) > time) return false;

      // Réinsérée en dernier : l'ordre de la Map reste celui des expirations
      until.delete(key);
      if (until.size >= maxKeys) {
        for (const [other, end] of until) if (end <= time) until.delete(other);
        evictOldest(until, maxKeys);
      }
      until.set(key, time + ttlMs);
      return true;
    },
    get size() {
      return until.size;
    },
  };
}
