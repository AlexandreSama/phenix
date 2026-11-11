import { garageAdminEnvSchema, storageEnvSchema } from '@phenix/storage';
import { z } from 'zod';
import { TRACKER_GG_URL } from './modules/td2/stats/tracker-gg.js';

const snowflake = z.string().regex(/^\d{17,20}$/, 'ID Discord invalide');

/** Une variable vide dans .env compte comme absente. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/**
 * Les variables du bot, plus celles du stockage S3 (transcripts et preuves) et de l'API
 * d'administration de Garage (page Métriques).
 */
const envSchema = storageEnvSchema.extend({
  ...garageAdminEnvSchema.shape,
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
  /** La version affichée sur la page Métriques (un SHA git, par exemple). Vide = « dev » */
  APP_VERSION: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().default('dev'),
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
