import { z } from 'zod';
import { DASHBOARD_MODULES } from '../constants.js';

/** Les onglets ouverts à un membre : au moins un, sans doublon. Sans onglet, on retire l'accès. */
export const guildDelegateInputSchema = z.object({
  modules: z
    .array(z.enum(DASHBOARD_MODULES))
    .min(1, 'Coche au moins un onglet')
    .transform((modules) => [...new Set(modules)]),
});

export type GuildDelegateInput = z.input<typeof guildDelegateInputSchema>;

/** La recherche d'un membre par pseudo, pour lui ouvrir des onglets. */
export const memberSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Deux lettres au moins').max(32, '32 caractères au plus'),
});
