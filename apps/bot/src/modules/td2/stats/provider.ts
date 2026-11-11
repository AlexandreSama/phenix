import type { Td2PlatformKey } from '@phenix/shared';

/** Une statistique, prête à être mise en forme : un nombre, une durée ou un texte. */
export type Td2Stat =
  | { kind: 'number'; value: number }
  | { kind: 'duration'; seconds: number }
  | { kind: 'text'; value: string };

/** Les statistiques qu'affiche /td2 stats, quel que soit le service qui les fournit. */
export const TD2_STAT_KEYS = [
  'level',
  'gearScore',
  'specialization',
  'timePlayed',
  'timePve',
  'timeDarkZone',
  'npcKills',
  'eliteKills',
  'namedKills',
  'headshots',
  'dzRank',
  'roguesKilled',
  'pvpKills',
] as const;

export type Td2StatKey = (typeof TD2_STAT_KEYS)[number];

/** La carrière d'un agent. */
export interface Td2Career {
  platform: Td2PlatformKey;
  /** Le pseudo exact, avec ses majuscules, tel que le service le connaît */
  handle: string;
  avatarUrl: string | null;
  /** La page du profil chez le service, pour le titre cliquable ; null si le service n'en a pas */
  profileUrl: string | null;
  /** Une stat que le service ne donne pas est absente : l'embed saute sa ligne */
  stats: Partial<Record<Td2StatKey, Td2Stat>>;
}

/** Pourquoi le service ne répond pas : pas de clé, clé refusée, trop de demandes, panne. */
export type Td2StatsUnavailable = 'no-key' | 'refused' | 'rate-limited' | 'down';

export type Td2CareerResult =
  | { status: 'ok'; career: Td2Career }
  | { status: 'not-found' }
  | { status: 'unavailable'; reason: Td2StatsUnavailable };

/**
 * Ce que le bot attend d'un service de stats. Les commandes ne connaissent que cette interface :
 * changer de service, c'est écrire une autre implémentation, sans toucher aux commandes.
 */
export interface Td2StatsProvider {
  /** false quand aucune clé n'est configurée : inutile d'appeler le service */
  readonly enabled: boolean;
  /** La mention exigée par le service, en pied d'embed */
  readonly credit: string;
  career(platform: Td2PlatformKey, playerName: string): Promise<Td2CareerResult>;
  /** Des pseudos proches de `query`, pour l'autocomplétion ; [] si le service ne répond pas */
  search(platform: Td2PlatformKey, query: string): Promise<string[]>;
}

/** Sans clé : les stats sont indisponibles, et /td2 lier enregistre le pseudo sans le vérifier. */
export const disabledStatsProvider: Td2StatsProvider = {
  enabled: false,
  credit: '',
  career: async () => ({ status: 'unavailable', reason: 'no-key' }),
  search: async () => [],
};
