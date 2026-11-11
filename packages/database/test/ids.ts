import { randomInt } from 'node:crypto';

/**
 * Des ID de serveur uniques pour les tests d'intégration.
 *
 * Vitest lance les fichiers de test en parallèle sur la même base. Avec `Date.now()` seul,
 * deux fichiers chargés dans la même milliseconde fabriquaient les mêmes ID, et le second
 * `guild.create` échouait sur `Guild_pkey`. Le tirage au hasard, fait une fois par fichier
 * (Vitest charge ce module à part pour chaque fichier), les sépare ; le compteur sépare les
 * serveurs d'un même fichier.
 */
const runId = `${Date.now()}${randomInt(100_000, 1_000_000)}`;
let counter = 0;

export const newGuildId = (): string => `${runId}${counter++}`;
