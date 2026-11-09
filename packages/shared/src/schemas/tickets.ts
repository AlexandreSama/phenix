import { z } from 'zod';
import { snowflakeSchema } from './guild-config.js';

export const TICKET_LIMITS = {
  staffRoles: 10,
  title: 100,
  description: 1000,
  buttonLabel: 80,
} as const;

/** Un <select> laissé vide envoie '' : on le dit en clair plutôt que « ID Discord invalide ». */
const requiredId = (message: string) => z.string().min(1, message).pipe(snowflakeSchema);

/** Le message « Ouvrir un ticket » que le bot poste dans un salon. */
export const ticketPanelSchema = z.object({
  channelId: requiredId('Choisis le salon du panel'),
  title: z
    .string()
    .trim()
    .min(1, 'Le titre est obligatoire')
    .max(TICKET_LIMITS.title, `${TICKET_LIMITS.title} caractères au plus`),
  description: z
    .string()
    .trim()
    .max(TICKET_LIMITS.description, `${TICKET_LIMITS.description} caractères au plus`)
    .nullable(),
  buttonLabel: z
    .string()
    .trim()
    .min(1, 'Le texte du bouton est obligatoire')
    .max(TICKET_LIMITS.buttonLabel, `${TICKET_LIMITS.buttonLabel} caractères au plus`),
});

/** Les réglages de l'onglet « Tickets » : où ouvrir les tickets, qui les traite, le panel. */
export const ticketSettingsSchema = z.object({
  categoryId: requiredId('Choisis une catégorie'),
  staffRoleIds: z
    .array(snowflakeSchema)
    .min(1, 'Choisis au moins un rôle : sinon personne ne verrait les tickets')
    .max(TICKET_LIMITS.staffRoles, `${TICKET_LIMITS.staffRoles} rôles au plus`),
  logChannelId: snowflakeSchema.nullable(),
  panel: ticketPanelSchema,
});

export type TicketPanelInput = z.infer<typeof ticketPanelSchema>;
export type TicketSettingsInput = z.infer<typeof ticketSettingsSchema>;

/** ?status=open|closed&page= de la liste des tickets. */
export const ticketListQuerySchema = z.object({
  status: z.enum(['open', 'closed']).default('open'),
  page: z.coerce
    .number({ error: 'Numéro de page invalide' })
    .int('Numéro de page invalide')
    .min(1, 'Numéro de page invalide')
    .max(1000, 'Numéro de page invalide')
    .default(1),
});

export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

/** Tickets par page sur le site. */
export const TICKET_PAGE_SIZE = 20;
