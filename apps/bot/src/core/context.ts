import type { PrismaClient } from '@phenix/database';
import type { Logger } from '../logger.js';

/** Ce que le bot fournit à chaque commande : la base et les logs. Les tests en passent de faux. */
export interface BotContext {
  db: PrismaClient;
  logger: Logger;
}
