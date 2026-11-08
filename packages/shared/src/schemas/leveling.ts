import { z } from 'zod';
import { snowflakeSchema } from './guild-config.js';

const xpAmount = z
    .number({ error: 'Entre un nombre' })
    .int('Nombre entier attendu')
    .min(1, '1 XP au moins')
    .max(100, '100 XP au plus');

/** Les champs de la page « Niveaux », sans la règle qui relie le minimum et le maximum. */
export const levelingConfigFields = z.object({
  xpEnabled: z.boolean(),
  xpMin: xpAmount,
  xpMax: xpAmount,
  xpCooldownSec: z
      .number({ error: 'Entre un nombre' })
      .int('Nombre entier attendu')
      .min(0, 'Pas de délai négatif')
      .max(3600, 'Une heure au plus'),
  levelUpChannelId: snowflakeSchema.nullable(),
  leaderboardPublic: z.boolean(),
});

/**
 * Ajoute la règle « minimum ≤ maximum » à un schéma. Dans une modification partielle,
 * elle ne se vérifie que si les deux champs sont présents ; l'API la revérifie sur la config complète.
 * (zod 4 refuse .partial() et .extend() sur un schéma raffiné : on raffine en dernier.)
 */
export function withXpRange<T extends z.ZodType<{ xpMin?: number; xpMax?: number }>>(schema: T): T {
  return schema.refine(
      ({ xpMin, xpMax }) => xpMin === undefined || xpMax === undefined || xpMin <= xpMax,
      { message: "Le minimum d'XP doit être inférieur ou égal au maximum", path: ['xpMin'] },
  );
}

/** Réglages XP d'un serveur. */
export const levelingConfigSchema = withXpRange(levelingConfigFields);

/** Une modification envoyée par le site : seulement les champs qui changent. */
export const levelingConfigPatchSchema = withXpRange(levelingConfigFields.partial());

export type LevelingConfig = z.infer<typeof levelingConfigSchema>;
export type LevelingConfigPatch = z.infer<typeof levelingConfigPatchSchema>;

/** Paramètre ?page= du classement public. */
export const leaderboardQuerySchema = z.object({
  page: z.coerce
      .number({ error: 'Numéro de page invalide' })
      .int('Numéro de page invalide')
      .min(1, 'Numéro de page invalide')
      .max(1000, 'Numéro de page invalide')
      .default(1),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;