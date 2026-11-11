import type { Td2PlatformKey } from '@phenix/shared';
import { z } from 'zod';
import {
  TD2_STAT_KEYS,
  type Td2Career,
  type Td2CareerResult,
  type Td2Stat,
  type Td2StatKey,
  type Td2StatsProvider,
} from './provider.js';

export const TRACKER_GG_URL = 'https://public-api.tracker.gg/v2';

/** Les pages de profil du site (pas de l'API) ; format à confirmer en ouvrant un profil réel. */
export const TRACKER_GG_PROFILE_URL = 'https://tracker.gg/division-2/profile';

/** Les plateformes, comme les nomme l'API (documentation tracker.gg : ubi, psn, xbl). */
export const PLATFORM_SLUGS: Record<Td2PlatformKey, string> = {
  UBI: 'ubi',
  PSN: 'psn',
  XBL: 'xbl',
};

/**
 * Nos statistiques → les clés de l'API. Relevées dans des projets publics qui lisent cette
 * API ; à confirmer sur une vraie réponse avec `pnpm --filter @phenix/bot td2:record`.
 */
export const TRACKER_STAT_KEYS: Record<Td2StatKey, string> = {
  level: 'highestPlayerLevel',
  gearScore: 'latestGearScore',
  specialization: 'specialization',
  timePlayed: 'timePlayed',
  timePve: 'timePlayedPve',
  timeDarkZone: 'timePlayedDarkZone',
  npcKills: 'killsNpc',
  eliteKills: 'killsRoleElite',
  namedKills: 'killsRoleNamed',
  headshots: 'headshots',
  dzRank: 'rankDZ',
  roguesKilled: 'roguesKilled',
  pvpKills: 'killsPvP',
};

const DURATIONS = new Set<Td2StatKey>(['timePlayed', 'timePve', 'timeDarkZone']);
const TEXTS = new Set<Td2StatKey>(['specialization']);

const rawStatSchema = z.object({
  value: z.unknown().optional(),
  displayValue: z.string().nullish(),
  displayType: z.string().nullish(),
});
type RawStat = z.infer<typeof rawStatSchema>;

/** Le strict nécessaire de la réponse : le reste peut changer sans rien casser. */
const profileSchema = z.object({
  data: z.object({
    platformInfo: z.object({
      platformUserHandle: z.string().min(1),
      avatarUrl: z.string().nullish(),
    }),
    segments: z.array(
      z.object({
        type: z.string().nullish(),
        stats: z.record(z.string(), rawStatSchema),
      }),
    ),
  }),
});

const searchSchema = z.object({
  data: z.array(z.object({ platformUserHandle: z.string().min(1) })),
});

const text = (raw: RawStat): Td2Stat | undefined => {
  const value = raw.displayValue?.trim() || (typeof raw.value === 'string' ? raw.value.trim() : '');
  return value ? { kind: 'text', value } : undefined;
};

/**
 * Une stat de l'API → une stat du bot. Une durée n'est un nombre de secondes que si l'API le
 * dit (`displayType`) ; sinon on garde son texte tel quel plutôt que d'afficher un nombre faux.
 */
export function toStat(key: Td2StatKey, raw: RawStat): Td2Stat | undefined {
  const value = typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : null;
  if (TEXTS.has(key)) return text(raw);
  if (DURATIONS.has(key)) {
    if (value !== null && raw.displayType === 'TimeSeconds') {
      return { kind: 'duration', seconds: value };
    }
    if (value !== null && raw.displayType === 'TimeMinutes') {
      return { kind: 'duration', seconds: value * 60 };
    }
    return text(raw);
  }
  return value === null ? text(raw) : { kind: 'number', value };
}

/** La réponse de l'API → la carrière. Les stats de carrière sont dans le segment « overview ». */
export function toCareer(platform: Td2PlatformKey, body: z.infer<typeof profileSchema>): Td2Career {
  const { platformInfo, segments } = body.data;
  const overview = segments.find((segment) => segment.type === 'overview') ?? segments[0];
  const stats: Td2Career['stats'] = {};
  for (const key of TD2_STAT_KEYS) {
    const raw = overview?.stats[TRACKER_STAT_KEYS[key]];
    const stat = raw && toStat(key, raw);
    if (stat) stats[key] = stat;
  }
  return {
    platform,
    handle: platformInfo.platformUserHandle,
    avatarUrl: platformInfo.avatarUrl ?? null,
    profileUrl: `${TRACKER_GG_PROFILE_URL}/${PLATFORM_SLUGS[platform]}/${encodeURIComponent(platformInfo.platformUserHandle)}/overview`,
    stats,
  };
}

/** Le code HTTP → ce que le bot en dit. 400 vise ce pseudo-là, pas le service : introuvable. */
function failure(status: number): Td2CareerResult {
  if (status === 404 || status === 400) return { status: 'not-found' };
  if (status === 401 || status === 403) return { status: 'unavailable', reason: 'refused' };
  if (status === 429) return { status: 'unavailable', reason: 'rate-limited' };
  return { status: 'unavailable', reason: 'down' };
}

export interface TrackerGgOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Au-delà, la commande répond « le service ne répond pas » */
  timeoutMs?: number;
  /** L'autocomplétion doit répondre à Discord en moins de 3 secondes */
  searchTimeoutMs?: number;
}

/** L'API de Tracker Network (tracker.gg), gratuite pour un projet non commercial. */
export function createTrackerGgProvider({
  apiKey,
  baseUrl = TRACKER_GG_URL,
  fetch: fetchImpl = fetch,
  timeoutMs = 8000,
  searchTimeoutMs = 2000,
}: TrackerGgOptions): Td2StatsProvider {
  const root = `${baseUrl.replace(/\/+$/, '')}/division-2/standard`;
  const get = (path: string, timeout: number) =>
    fetchImpl(`${root}${path}`, {
      headers: { 'TRN-Api-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    });

  return {
    enabled: true,
    credit: 'Powered by Tracker Network',

    async career(platform, playerName) {
      try {
        const slug = PLATFORM_SLUGS[platform];
        const response = await get(
          `/profile/${slug}/${encodeURIComponent(playerName.trim())}`,
          timeoutMs,
        );
        if (!response.ok) return failure(response.status);
        const parsed = profileSchema.safeParse(await response.json());
        if (!parsed.success) return { status: 'unavailable', reason: 'down' };
        return { status: 'ok', career: toCareer(platform, parsed.data) };
      } catch {
        // Délai dépassé, réseau coupé, JSON illisible : pour le membre, c'est une panne
        return { status: 'unavailable', reason: 'down' };
      }
    },

    async search(platform, query) {
      try {
        const params = new URLSearchParams({ platform: PLATFORM_SLUGS[platform], query });
        const response = await get(`/search?${params}`, searchTimeoutMs);
        if (!response.ok) return [];
        const parsed = searchSchema.safeParse(await response.json());
        if (!parsed.success) return [];
        return [...new Set(parsed.data.data.map((result) => result.platformUserHandle))];
      } catch {
        return [];
      }
    },
  };
}
