import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  /** Adresse publique du site : sert à construire l'URL de retour OAuth2 et les redirections */
  PUBLIC_URL: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/, 'ID Discord invalide'),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  /** Token du bot : l'API lit les salons et rôles d'un serveur même quand le bot redémarre */
  DISCORD_TOKEN: z.string().min(1),
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
