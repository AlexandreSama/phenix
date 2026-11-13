import { pino, type DestinationStream } from 'pino';

/**
 * Le corps d'une requête Discord échouée (`requestBody` d'une `DiscordAPIError`) contient les
 * messages envoyés : réponses d'un formulaire de ticket, pseudo du membre. Il n'entre jamais
 * dans les logs.
 */
const REDACTED_PATHS = ['err.requestBody', '*.requestBody'];

/** Logs JSON en production, lisibles en dev grâce à pino-pretty. */
export function createLogger(destination?: DestinationStream) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: { paths: REDACTED_PATHS, censor: '[Masqué]' },
      ...(!destination &&
        process.env.NODE_ENV === 'development' && {
          transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
        }),
    },
    destination,
  );
}

export const logger = createLogger();

export type Logger = typeof logger;
