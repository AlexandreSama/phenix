import { CASE_RETENTION_CHOICES, generalConfigSchema, type GeneralConfig } from '@phenix/shared';
import { z } from 'zod';

/** Dans un <select>, « Aucun » vaut une chaîne vide ; l'API attend null. */
const emptyToNull = (value: unknown) => (value === '' ? null : value);

/** Valeur du <select> pour « Jamais » : une option ne porte qu'une chaîne. */
export const RETENTION_NEVER = 'never';

/** Un <select> rend une chaîne : « 6 » devient le nombre 6, « never » devient null. */
const retentionFromSelect = (value: unknown) =>
  value === RETENTION_NEVER ? null : typeof value === 'string' ? Number(value) : value;

export const retentionToSelect = (months: number | null) =>
  months === null ? RETENTION_NEVER : String(months);

export const RETENTION_OPTIONS = CASE_RETENTION_CHOICES.map(({ months, label }) => ({
  value: retentionToSelect(months),
  label,
}));

/** Le schéma partagé, adapté au formulaire. La validation reste celle de l'API. */
export const generalFormSchema = generalConfigSchema.extend({
  modLogChannelId: z.preprocess(emptyToNull, generalConfigSchema.shape.modLogChannelId),
  announceChannelId: z.preprocess(emptyToNull, generalConfigSchema.shape.announceChannelId),
  caseRetentionMonths: z.preprocess(
    retentionFromSelect,
    generalConfigSchema.shape.caseRetentionMonths,
  ),
});

export type GeneralFormInput = z.input<typeof generalFormSchema>;

export function toFormValues(config: GeneralConfig): GeneralFormInput {
  return {
    ...config,
    modLogChannelId: config.modLogChannelId ?? '',
    announceChannelId: config.announceChannelId ?? '',
    caseRetentionMonths: retentionToSelect(config.caseRetentionMonths),
  };
}

/** Fuseaux proposés ; celui du serveur est ajouté s'il n'est pas dans la liste. */
export const TIMEZONES = [
  'Europe/Paris',
  'Europe/Brussels',
  'Europe/Zurich',
  'Europe/Luxembourg',
  'America/Toronto',
  'America/Martinique',
  'America/Guadeloupe',
  'America/Cayenne',
  'Indian/Reunion',
  'Pacific/Noumea',
  'Pacific/Tahiti',
  'Africa/Casablanca',
  'Africa/Algiers',
  'Africa/Tunis',
  'Africa/Dakar',
  'UTC',
];
