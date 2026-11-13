import type { PrismaClient } from '@phenix/database';
import type { Client } from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import { deleteMessageQuietly, whenReady } from '../../core/publish.js';
import type { Logger } from '../../logger.js';
import { createClaimHandler } from './claim.js';
import { createCloseTicketButtons } from './close.js';
import { createOpenTicketHandlers } from './open.js';
import { publishTicketPanel } from './publish.js';
import { createRatingHandler } from './rating.js';

export { registerTicketAutomation } from './automation.js';
export { closeOrphanTickets, createTicketChannelDeleteHandler } from './lifecycle.js';
export { publishPendingTicketPanels } from './publish.js';

/** Créés une seule fois : les verrous anti double-clic vivent dans ces handlers. */
export const ticketComponents: ComponentHandler[] = [
  ...createOpenTicketHandlers(),
  ...createCloseTicketButtons(),
  ...createClaimHandler(),
  ...createRatingHandler(),
];

export interface TicketPanelPublisher {
  publish(guildId: string): Promise<void>;
  remove(message: { channelId: string; messageId: string }): Promise<void>;
}

export function createTicketPanelPublisher(
  client: Client,
  db: Pick<PrismaClient, 'ticketPanel' | 'ticketType'>,
  logger: Pick<Logger, 'info' | 'warn'>,
): TicketPanelPublisher {
  return {
    async publish(guildId) {
      await whenReady(client);
      await publishTicketPanel(client, db, guildId, logger);
    },
    async remove(message) {
      await whenReady(client);
      await deleteMessageQuietly(client, message, logger);
    },
  };
}
