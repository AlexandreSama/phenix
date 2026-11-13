import { ticketPanelSchema, ticketSettingsSchema, type TicketSettings } from '@phenix/shared';
import { z } from 'zod';

/** Un champ vidé ou « Aucun » vaut une chaîne vide ; l'API attend null. */
const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Le schéma partagé, adapté aux champs du formulaire : mêmes règles et mêmes messages que l'API. */
export const ticketFormSchema = ticketSettingsSchema.extend({
  logChannelId: z.preprocess(emptyToNull, ticketSettingsSchema.shape.logChannelId),
  panel: ticketPanelSchema.extend({
    description: z.preprocess(emptyToNull, ticketPanelSchema.shape.description),
  }),
});

export type TicketFormInput = z.input<typeof ticketFormSchema>;

/** Un panel prêt à l'emploi pour un premier réglage. */
export const DEFAULT_PANEL = {
  title: 'Besoin d’aide ?',
  description: 'Clique sur le bouton : un salon privé s’ouvre, visible de toi et de l’équipe.',
  buttonLabel: 'Ouvrir un ticket',
};

export function toFormValues(settings: TicketSettings | null): TicketFormInput {
  if (!settings) {
    return {
      logChannelId: '',
      panel: { channelId: '', ...DEFAULT_PANEL },
    };
  }
  return {
    logChannelId: settings.logChannelId ?? '',
    panel: { ...settings.panel, description: settings.panel.description ?? '' },
  };
}
