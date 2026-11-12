import { DiscordAPIError } from 'discord.js';
import { pino } from 'pino';
import type { Logger } from '../../logger.js';

/** Un membre fictif dont ni l'ID ni le pseudo ne doivent apparaître dans les logs. */
export const MEMBER_ID = '200000000000000042';
export const PSEUDO = 'Agent Secret';

/** Un vrai logger pino qui écrit en mémoire : on vérifie les lignes JSON réellement produites. */
export function captureLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const logger = pino({ level: 'trace' }, { write: (line: string) => void lines.push(line) });
  return { logger, lines };
}

/** Une erreur Discord dont l'URL porte l'ID du membre et le corps son pseudo, comme les vraies. */
export function discordErrorWithMemberData(): DiscordAPIError {
  return new DiscordAPIError(
    { code: 50013, message: 'Missing Permissions' },
    50013,
    403,
    'PUT',
    `https://discord.com/api/v10/guilds/100000000000000001/members/${MEMBER_ID}/roles/1`,
    { body: { nick: PSEUDO } },
  );
}
