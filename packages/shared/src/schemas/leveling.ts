import { z } from 'zod';
import {
  XP_MULTIPLIER_KINDS,
  XP_MULTIPLIER_MAX_PERCENT,
  XP_MULTIPLIER_MIN_PERCENT,
} from '../xp-multipliers.js';
import { snowflakeSchema } from './guild-config.js';

const xpAmount = z
  .number({ error: 'Entre un nombre' })
  .int('Nombre entier attendu')
  .min(1, '1 XP au moins')
  .max(100, '100 XP au plus');

/** Nombre de salons exclus du gain d'XP au plus, par serveur. */
export const MAX_XP_EXCLUDED_CHANNELS = 50;

/** Nombre de bonus d'XP (rôles, salons, catégories) au plus, par serveur. */
export const MAX_XP_MULTIPLIERS = 50;

/** Un bonus ou un malus d'XP sur un rôle, un salon ou une catégorie ; 100 % = inchangé. */
export const xpMultiplierSchema = z.object({
  kind: z.enum(XP_MULTIPLIER_KINDS, { error: 'Type de bonus inconnu' }),
  targetId: snowflakeSchema,
  percent: z
    .number({ error: 'Entre un nombre' })
    .int('Nombre entier attendu')
    .min(XP_MULTIPLIER_MIN_PERCENT, `${XP_MULTIPLIER_MIN_PERCENT} % au moins`)
    .max(XP_MULTIPLIER_MAX_PERCENT, `${XP_MULTIPLIER_MAX_PERCENT} % au plus`),
});

/** La liste des bonus d'un serveur, une cible n'y figurant qu'une fois. */
export const xpMultipliersSchema = z
  .array(xpMultiplierSchema)
  .max(MAX_XP_MULTIPLIERS, `${MAX_XP_MULTIPLIERS} bonus au plus`)
  .refine(
    (list) => new Set(list.map((entry) => entry.targetId)).size === list.length,
    'Un rôle, un salon ou une catégorie ne peut avoir qu’un seul bonus',
  );

export type XpMultiplierEntry = z.infer<typeof xpMultiplierSchema>;

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
  /** Salons textes, vocaux ou catégories où l'on ne gagne pas d'XP en écrivant ; les fils en héritent. */
  xpExcludedChannelIds: z
    .array(snowflakeSchema)
    .max(MAX_XP_EXCLUDED_CHANNELS, `${MAX_XP_EXCLUDED_CHANNELS} salons au plus`)
    .refine((ids) => new Set(ids).size === ids.length, 'Un salon ne peut figurer qu’une fois'),
  /** Plafond du total des bonus d'XP, en pourcentage du gain de base. */
  xpMultiplierMaxPercent: z
    .number({ error: 'Entre un nombre' })
    .int('Nombre entier attendu')
    .min(100, '100 % au moins')
    .max(1000, '1000 % au plus'),
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
