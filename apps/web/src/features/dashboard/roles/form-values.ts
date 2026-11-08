import {
  rolePanelFields,
  rolePanelOptionSchema,
  rolePanelOptionsSchema,
  withUniqueRoles,
  type RolePanelDetail,
} from '@phenix/shared';
import { z } from 'zod';

/** Un champ texte vidé vaut une chaîne vide ; l'API attend null. */
const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Le schéma partagé, adapté aux champs du formulaire. Mêmes règles, mêmes messages que l'API. */
export const rolePanelFormSchema = withUniqueRoles(
  rolePanelFields.extend({
    description: z.preprocess(emptyToNull, rolePanelFields.shape.description),
    options: rolePanelOptionsSchema(
      rolePanelOptionSchema.extend({
        emoji: z.preprocess(emptyToNull, rolePanelOptionSchema.shape.emoji),
      }),
    ),
  }),
);

export type RolePanelFormInput = z.input<typeof rolePanelFormSchema>;

export const emptyOption = { roleId: '', label: '', emoji: '' };

export function toFormValues(panel?: RolePanelDetail): RolePanelFormInput {
  if (!panel) {
    return { title: '', description: '', channelId: '', mode: 'MULTIPLE', options: [emptyOption] };
  }
  return {
    title: panel.title,
    description: panel.description ?? '',
    channelId: panel.channelId,
    mode: panel.mode,
    options: panel.options.map((option) => ({ ...option, emoji: option.emoji ?? '' })),
  };
}
