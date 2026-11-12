import { welcomeChannelRule, welcomeSettingsFields, type WelcomeSettings } from '@phenix/shared';
import { z } from 'zod';

/** Dans un <select>, « Aucun » vaut une chaîne vide ; l'API attend null. */
const emptyToNull = (value: unknown) => (value === '' ? null : value);

const nullableId = <T extends z.ZodType>(field: T) => z.preprocess(emptyToNull, field);

/** Le schéma partagé, adapté au formulaire. La règle « activé => salon » est celle de l'API. */
export const welcomeFormSchema = welcomeChannelRule(
  welcomeSettingsFields.extend({
    welcomeChannelId: nullableId(welcomeSettingsFields.shape.welcomeChannelId),
    welcomeRoleId: nullableId(welcomeSettingsFields.shape.welcomeRoleId),
    goodbyeChannelId: nullableId(welcomeSettingsFields.shape.goodbyeChannelId),
  }),
);

export type WelcomeFormInput = z.input<typeof welcomeFormSchema>;

/** Les champs vides du formulaire sont des chaînes vides, jamais null. */
export function toFormValues(settings: WelcomeSettings): WelcomeFormInput {
  return {
    ...settings,
    welcomeChannelId: settings.welcomeChannelId ?? '',
    welcomeMessage: settings.welcomeMessage ?? '',
    welcomeRoleId: settings.welcomeRoleId ?? '',
    goodbyeChannelId: settings.goodbyeChannelId ?? '',
    goodbyeMessage: settings.goodbyeMessage ?? '',
  };
}
