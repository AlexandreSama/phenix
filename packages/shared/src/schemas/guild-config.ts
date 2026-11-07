import { z } from 'zod';

/** ID Discord (snowflake) : 17 à 20 chiffres. */
export const snowflakeSchema = z.string().regex(/^\d{17,20}$/, 'ID Discord invalide');

/** Réglages généraux d'une guilde, modifiables depuis le dashboard. */
export const guildConfigSchema = z
  .object({
    timezone: z.string().min(1),
    modLogChannelId: snowflakeSchema.nullable(),
    staffRoleIds: z.array(snowflakeSchema),
    announceChannelId: snowflakeSchema.nullable(),
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
