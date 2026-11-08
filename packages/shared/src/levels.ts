/**
 * Courbe des niveaux, partagée par le bot, l'API et le site.
 * Passer du niveau n au niveau n + 1 demande 5n² + 50n + 100 XP : 100 pour le niveau 1,
 * 155 pour le 2, 220 pour le 3… Les premiers niveaux arrivent vite, les suivants se méritent.
 */
export function xpToNextLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

/** XP totale qu'il faut avoir accumulée pour atteindre un niveau (0 pour le niveau 0). */
export function totalXpForLevel(level: number): number {
  // Somme de xpToNextLevel(k) pour k de 0 à level - 1, sous forme fermée
  const n = level;
  return (5 * (n - 1) * n * (2 * n - 1)) / 6 + 25 * (n - 1) * n + 100 * n;
}

/** Le niveau atteint avec une quantité d'XP. */
export function levelForXp(xp: number): number {
  let level = 0;
  while (totalXpForLevel(level + 1) <= xp) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP gagnée depuis le début du niveau actuel */
  current: number;
  /** XP du niveau actuel au suivant */
  needed: number;
  /** Avancement entre 0 et 1, pour une barre de progression */
  ratio: number;
}

/** Où en est un membre dans son niveau : de quoi dessiner une barre « 340 / 520 XP ». */
export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const current = xp - totalXpForLevel(level);
  const needed = xpToNextLevel(level);
  return { level, current, needed, ratio: current / needed };
}

/** Réglages XP appliqués quand un serveur n'a pas encore de config (mêmes valeurs que la base). */
export const LEVELING_DEFAULTS = {
  xpEnabled: true,
  xpMin: 15,
  xpMax: 25,
  xpCooldownSec: 60,
  levelUpChannelId: null,
  leaderboardPublic: true,
} as const;

/** Membres par page du classement : le bot en montre moins que le site. */
export const LEADERBOARD_PAGE_SIZE = { bot: 10, site: 25 } as const;
