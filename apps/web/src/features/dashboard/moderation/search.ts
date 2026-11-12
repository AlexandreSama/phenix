import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, snowflakeSchema } from '@phenix/shared';
import { z } from 'zod';

const CASE_TYPES = Object.keys(CASE_TYPE_LABELS) as [keyof typeof CASE_TYPE_LABELS];
const CASE_STATUSES = Object.keys(CASE_STATUS_LABELS) as [keyof typeof CASE_STATUS_LABELS];

/** AAAA-MM-JJ d'un vrai jour du calendrier. */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

/**
 * Les filtres de la liste, dans l'adresse de la page. Une valeur invalide revient à la valeur par
 * défaut (le filtre disparaît) au lieu de casser la page ; l'API revérifie tout.
 */
export const moderationSearchSchema = z
  .object({
    type: z.enum(CASE_TYPES).optional().catch(undefined),
    status: z.enum(CASE_STATUSES).optional().catch(undefined),
    moderatorId: snowflakeSchema.optional().catch(undefined),
    targetId: snowflakeSchema.optional().catch(undefined),
    q: z
      .string()
      .trim()
      .max(100)
      .transform((value) => value || undefined)
      .optional()
      .catch(undefined),
    from: day.optional().catch(undefined),
    to: day.optional().catch(undefined),
    page: z.number().int().min(1).max(1000).optional().catch(undefined),
  })
  // Une période à l'envers n'a pas de résultat possible (l'API la refuse) : on garde le début
  .transform((search) =>
    search.from && search.to && search.from > search.to ? { ...search, to: undefined } : search,
  );

export type ModerationSearch = z.infer<typeof moderationSearchSchema>;
