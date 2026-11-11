import { z } from 'zod';

/**
 * Le battement de cœur du bot : une clé Valkey réécrite toutes les 30 secondes et qui expire
 * au bout de 90. Si elle manque, le bot ne tourne plus ou n'est plus connecté à Discord.
 */
export const BOT_HEARTBEAT = {
  key: 'bot:heartbeat',
  intervalSeconds: 30,
  ttlSeconds: 90,
} as const;

export const botHeartbeatSchema = z.object({
  /** Date du dernier battement (ISO 8601) */
  at: z.iso.datetime(),
  guilds: z.number().int().nonnegative(),
  /** Latence de la connexion à Discord, en millisecondes ; -1 tant qu'elle n'est pas mesurée */
  ping: z.number(),
});
export type BotHeartbeat = z.infer<typeof botHeartbeatSchema>;
