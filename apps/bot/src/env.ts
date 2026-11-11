import { z } from 'zod';
import { storageEnvSchema } from '@phenix/storage';
import { TRACKER_GG_URL } from './modules/td2/stats/tracker-gg.js';

const snowflake = z.string().regex(/^\d{17,20}$/, 'ID Discord invalide');

/** Une variable vide dans .env compte comme absente. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = storageEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_DEV_GUILD_ID: optional(snowflake),
  /** Adresse du site : /leaderboard y renvoie vers le classement complet. Vide = pas de lien. */
  PUBLIC_URL: optional(z.url()),
  BOT_OWNER_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  /** Clé de l'API Tracker Network. Vide = /td2 stats répond que les stats ne sont pas branchées */
  TRN_API_KEY: optional(z.string().min(1)),
  /** Adresse de l'API de stats : à changer seulement pour un service compatible */
  TRN_API_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().default(TRACKER_GG_URL),
  ),
});

export type Env = z.infer<typeof envSchema>;

/** Valide les variables d'environnement. Arrête le processus avec un message clair si l'une manque. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    console.error(`Variables d'environnement invalides :\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
}
