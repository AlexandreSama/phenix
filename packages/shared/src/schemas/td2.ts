import { z } from 'zod';
import { snowflakeSchema } from './guild-config.js';

/** Réglages TD2 d'un serveur. Sans salon, la sortie est postée là où la commande est lancée. */
export const td2SettingsSchema = z.object({
  channelId: snowflakeSchema.nullable(),
});

export type Td2SettingsInput = z.infer<typeof td2SettingsSchema>;
