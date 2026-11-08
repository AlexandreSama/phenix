import { z } from 'zod';
import { snowflakeSchema } from './guild-config.js';

/** Limites de Discord (25 boutons par message, 80 caractères par bouton) et les nôtres. */
export const ROLE_PANEL_LIMITS = {
  panels: 25,
  options: 25,
  title: 100,
  description: 1000,
  label: 80,
} as const;

/** Un emoji Unicode (🎮, 🇫🇷, 👩‍💻) ou un emoji du serveur (<:nom:id>, <a:nom:id> s'il est animé). */
const EMOJI =
  /^(?:<a?:\w{2,32}:\d{17,20}>|(?=.*[\p{Extended_Pictographic}\p{Regional_Indicator}])[\p{Extended_Pictographic}\p{Emoji_Component}]{1,16})$/u;

export const emojiSchema = z
  .string()
  .trim()
  .regex(EMOJI, 'Un emoji, ou <:nom:id> pour un emoji du serveur');

export const rolePanelOptionSchema = z.object({
  roleId: snowflakeSchema,
  label: z
    .string()
    .trim()
    .min(1, 'Le texte du bouton est obligatoire')
    .max(ROLE_PANEL_LIMITS.label, `${ROLE_PANEL_LIMITS.label} caractères au plus`),
  emoji: emojiSchema.nullable(),
});

/** La liste des boutons, autour d'un schéma de bouton (le site y adapte le champ emoji). */
export function rolePanelOptionsSchema<T extends z.ZodType>(option: T) {
  return z
    .array(option)
    .min(1, 'Ajoute au moins un rôle')
    .max(
      ROLE_PANEL_LIMITS.options,
      `${ROLE_PANEL_LIMITS.options} rôles au plus : la limite de Discord`,
    );
}

/** Les champs d'un panel, sans la règle « un rôle par bouton ». */
export const rolePanelFields = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Le titre est obligatoire')
    .max(ROLE_PANEL_LIMITS.title, `${ROLE_PANEL_LIMITS.title} caractères au plus`),
  description: z
    .string()
    .trim()
    .max(ROLE_PANEL_LIMITS.description, `${ROLE_PANEL_LIMITS.description} caractères au plus`)
    .nullable(),
  channelId: snowflakeSchema,
  mode: z.enum(['MULTIPLE', 'UNIQUE']),
  options: rolePanelOptionsSchema(rolePanelOptionSchema),
});

/** Ajoute la règle « chaque rôle une seule fois » ; l'erreur s'affiche sous le doublon. */
export function withUniqueRoles<T extends z.ZodType<{ options: { roleId: string }[] }>>(
  schema: T,
): T {
  return schema.superRefine(({ options }, ctx) => {
    const seen = new Set<string>();
    options.forEach((option, index) => {
      if (seen.has(option.roleId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Ce rôle a déjà un bouton',
          path: ['options', index, 'roleId'],
        });
      }
      seen.add(option.roleId);
    });
  });
}

/** Un panel tel que le site l'envoie, à la création comme à la modification. */
export const rolePanelInputSchema = withUniqueRoles(rolePanelFields);

export type RolePanelInput = z.infer<typeof rolePanelInputSchema>;
export type RolePanelMode = RolePanelInput['mode'];
