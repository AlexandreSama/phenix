import { z } from 'zod';
import { requiredIdSchema, snowflakeSchema } from './guild-config.js';

export const GIVEAWAY_LIMITS = {
  prize: 200,
  winners: 20,
  /** Une minute au moins : le temps de voir passer le message */
  minDurationMs: 60_000,
  /** Trente jours au plus : au-delà, personne ne se souvient du giveaway */
  maxDurationMs: 30 * 86_400_000,
} as const;

/** Ce qu'on saisit pour lancer un giveaway, sur le site comme sur Discord. */
export const giveawayInputSchema = z.object({
  channelId: requiredIdSchema('Choisis un salon'),
  prize: z
    .string()
    .trim()
    .min(1, 'Le lot est obligatoire')
    .max(GIVEAWAY_LIMITS.prize, `${GIVEAWAY_LIMITS.prize} caractères au plus`),
  winnersCount: z
    .number({ error: 'Entre un nombre' })
    .int('Nombre entier attendu')
    .min(1, 'Un gagnant au moins')
    .max(GIVEAWAY_LIMITS.winners, `${GIVEAWAY_LIMITS.winners} gagnants au plus`),
  endsAt: z.iso.datetime({ offset: true, error: 'Date de fin invalide' }),
  requiredRoleId: snowflakeSchema.nullable(),
});

export type GiveawayInput = z.infer<typeof giveawayInputSchema>;

/**
 * La date de fin dépend de l'heure qu'il est : elle ne peut pas vivre dans le schéma.
 * Renvoie le problème en clair, ou null. Le site, l'API et /giveaway s'en servent.
 */
export function giveawayEndProblem(endsAt: Date, now: Date): string | null {
  const delay = endsAt.getTime() - now.getTime();
  if (Number.isNaN(delay)) return 'Date de fin invalide';
  if (delay < GIVEAWAY_LIMITS.minDurationMs) return 'La fin doit être dans une minute au moins';
  if (delay > GIVEAWAY_LIMITS.maxDurationMs) return 'Trente jours au plus';
  return null;
}

/** ?status=active|ended&page= de la liste des giveaways. */
export const giveawayListQuerySchema = z.object({
  status: z.enum(['active', 'ended']).default('active'),
  page: z.coerce
    .number({ error: 'Numéro de page invalide' })
    .int('Numéro de page invalide')
    .min(1, 'Numéro de page invalide')
    .max(1000, 'Numéro de page invalide')
    .default(1),
});

export type GiveawayListQuery = z.infer<typeof giveawayListQuerySchema>;

export const GIVEAWAY_PAGE_SIZE = 20;
