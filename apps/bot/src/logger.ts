import { pino } from 'pino';

/** Logs JSON en production, lisibles en dev grâce à pino-pretty. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
  }),
});

export type Logger = typeof logger;
