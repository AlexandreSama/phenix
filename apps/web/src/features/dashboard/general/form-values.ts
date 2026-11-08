import { generalConfigSchema, type GeneralConfig } from '@phenix/shared';
import { z } from 'zod';

/** Dans un <select>, « Aucun » vaut une chaîne vide ; l'API attend null. */
const emptyToNull = (value: unknown) => (value === '' ? null : value);

/** Le schéma partagé, adapté au formulaire. La validation reste celle de l'API. */
export const generalFormSchema = generalConfigSchema.extend({
  modLogChannelId: z.preprocess(emptyToNull, generalConfigSchema.shape.modLogChannelId),
  announceChannelId: z.preprocess(emptyToNull, generalConfigSchema.shape.announceChannelId),
});

export type GeneralFormInput = z.input<typeof generalFormSchema>;

export function toFormValues(config: GeneralConfig): GeneralFormInput {
  return {
    ...config,
    modLogChannelId: config.modLogChannelId ?? '',
    announceChannelId: config.announceChannelId ?? '',
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
