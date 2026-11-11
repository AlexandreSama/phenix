import { z } from 'zod';
import {
  TD2_DIRECTIVE_LIMITS,
  TD2_REPORT_STATUS_LABELS,
  type Td2ReportStatusKey,
} from '../constants.js';
import { snowflakeSchema } from './guild-config.js';

/**
 * Réglages TD2 d'un serveur : le salon des sorties (vide = là où la commande est lancée),
 * la page publique des sorties, et les trois réglages des signalements.
 * Les champs seuls : le site les adapte à son formulaire, puis y remet la règle ci-dessous.
 */
export const td2SettingsFields = z.object({
  channelId: snowflakeSchema.nullable(),
  /** Sorties affichées sur la page publique /sorties, avec un lien pour rejoindre le serveur */
  publicListing: z.boolean(),
  /** Salon du staff où arrivent les signalements faits sur ce serveur ; vide = signalements fermés */
  reportChannelId: snowflakeSchema.nullable(),
  /** Rôles qui peuvent consulter les signalements d'un joueur, en plus du staff */
  reportViewerRoleIds: z.array(snowflakeSchema).max(25, '25 rôles au plus'),
  /** Salon qui reçoit les signalements confirmés de tout le réseau ; vide = aucun fil */
  reportFeedChannelId: snowflakeSchema.nullable(),
});

/** L'invitation des visiteurs mène au salon des sorties : sans lui, rien à leur ouvrir. */
export function td2PublicListingRule<
  T extends z.ZodType<{ publicListing: boolean; channelId: string | null }>,
>(schema: T): T {
  return schema.refine((settings) => !settings.publicListing || settings.channelId !== null, {
    message: 'Choisis d’abord le salon des sorties : l’invitation y mène',
    path: ['publicListing'],
  });
}

export const td2SettingsSchema = td2PublicListingRule(td2SettingsFields);

export type Td2SettingsInput = z.infer<typeof td2SettingsSchema>;

// ---------- Catalogue, géré par les propriétaires du bot ----------

const catalogueName = z.string().trim().min(1, 'Donne un nom').max(40, '40 caractères au plus');

export const td2ActivityInputSchema = z.object({
  kind: z.enum(['RAID', 'INCURSION']),
  name: catalogueName,
});

export const td2ActivityPatchSchema = z
  .object({ name: catalogueName, active: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Rien à modifier');

const slotCount = z
  .number({ error: 'Un nombre de places' })
  .int('Un nombre entier')
  .min(0, 'Pas de places négatives')
  .max(8, '8 places au plus');

/** Un mode = un nom et une composition. Un groupe TD2 compte 8 joueurs au plus. */
export const td2ModeInputSchema = z
  .object({
    name: catalogueName,
    slots: z.object({ DPS: slotCount, HEAL: slotCount, TANK: slotCount, HEAL_TANK: slotCount }),
  })
  .refine(
    ({ slots }) => {
      const total = slots.DPS + slots.HEAL + slots.TANK + slots.HEAL_TANK;
      return total >= 1 && total <= 8;
    },
    { message: 'Entre 1 et 8 joueurs au total', path: ['slots'] },
  );

export type Td2ActivityInput = z.infer<typeof td2ActivityInputSchema>;
export type Td2ActivityPatch = z.infer<typeof td2ActivityPatchSchema>;
export type Td2ModeInput = z.infer<typeof td2ModeInputSchema>;

// ---------- Directives des missions, gérées par les propriétaires du bot ----------

export const td2DirectiveInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Donne un nom')
    .max(TD2_DIRECTIVE_LIMITS.nameMax, `${TD2_DIRECTIVE_LIMITS.nameMax} caractères au plus`),
  /** Ce que la directive change en jeu, affiché sous son nom dans le menu du bot ; vide = rien */
  description: z
    .string()
    .trim()
    .max(
      TD2_DIRECTIVE_LIMITS.descriptionMax,
      `${TD2_DIRECTIVE_LIMITS.descriptionMax} caractères au plus`,
    )
    .transform((text) => text || null)
    .nullable(),
});

export const td2DirectivePatchSchema = td2DirectiveInputSchema
  .extend({ active: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Rien à modifier');

export type Td2DirectiveInput = z.input<typeof td2DirectiveInputSchema>;
export type Td2DirectivePatch = z.input<typeof td2DirectivePatchSchema>;

// ---------- Signalements, côté administration ----------

const REPORT_STATUSES = Object.keys(TD2_REPORT_STATUS_LABELS) as [
  Td2ReportStatusKey,
  ...Td2ReportStatusKey[],
];

/** Filtres de la liste des signalements : statut, recherche sur le pseudo, page suivante. */
export const td2ReportQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  q: z.string().trim().max(40).optional(),
  cursor: z.coerce.number().int().positive().optional(),
});

export type Td2ReportQuery = z.infer<typeof td2ReportQuerySchema>;
