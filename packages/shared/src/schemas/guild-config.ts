import { z } from 'zod';

/** ID Discord (snowflake) : 17 à 20 chiffres. */
export const snowflakeSchema = z.string().regex(/^\d{17,20}$/, 'ID Discord invalide');

/** Vrai si le fuseau horaire est connu du moteur JavaScript (« Europe/Paris »…). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    return Boolean(new Intl.DateTimeFormat('fr-FR', { timeZone }).resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

/** Réglages généraux d'un serveur : la page « Général » du tableau de bord. */
export const generalConfigSchema = z.object({
  timezone: z.string().refine(isValidTimeZone, 'Fuseau horaire inconnu'),
  modLogChannelId: snowflakeSchema.nullable(),
  announceChannelId: snowflakeSchema.nullable(),
  staffRoleIds: z.array(snowflakeSchema).max(25, '25 rôles au plus'),
});

/** Une modification envoyée par le site : seulement les champs qui changent. */
export const generalConfigPatchSchema = generalConfigSchema.partial();

export type GeneralConfig = z.infer<typeof generalConfigSchema>;
export type GeneralConfigPatch = z.infer<typeof generalConfigPatchSchema>;

/** Toute la config d'un serveur : général + XP (page de la phase 5). */
export const guildConfigSchema = generalConfigSchema
  .extend({
    xpEnabled: z.boolean(),
    xpMin: z.number().int().min(1).max(100),
    xpMax: z.number().int().min(1).max(100),
    xpCooldownSec: z.number().int().min(0).max(3600),
  })
  .refine((config) => config.xpMin <= config.xpMax, {
    message: "Le minimum d'XP doit être inférieur ou égal au maximum",
    path: ['xpMin'],
  });

export type GuildConfigInput = z.infer<typeof guildConfigSchema>;
