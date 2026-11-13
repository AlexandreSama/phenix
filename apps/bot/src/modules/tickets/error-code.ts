import { DiscordAPIError } from 'discord.js';

/**
 * Le code d'une erreur (Discord, Prisma, réseau), jamais son message ni son corps : ils peuvent
 * porter pseudos, identifiants et contenus de messages. À utiliser dans les logs des automatismes.
 */
export function errorCode(err: unknown): number | string | undefined {
  if (err instanceof DiscordAPIError) return err.code;
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'number' || typeof code === 'string' ? code : undefined;
}
