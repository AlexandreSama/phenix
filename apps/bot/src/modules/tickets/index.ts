import type { PrismaClient } from '@phenix/database';
import type { Client } from 'discord.js';
import type { ComponentHandler } from '../../core/command.js';
import { deleteMessageQuietly, whenReady } from '../../core/publish.js';
import type { Logger } from '../../logger.js';
import { createCloseTicketButtons } from './close.js';
import { createOpenTicketButton } from './open.js';
import { publishTicketPanel } from './publish.js';

export { closeOrphanTickets, createTicketChannelDeleteHandler } from './lifecycle.js';
export { publishPendingTicketPanels } from './publish.js';

/** Créés une seule fois : les verrous anti double-clic vivent dans ces handlers. */
export const ticketComponents: ComponentHandler[] = [
  createOpenTicketButton(),
  ...createCloseTicketButtons(),
];

export interface TicketPanelPublisher {
  publish(guildId: string): Promise<void>;
  remove(message: { channelId: string; messageId: string }): Promise<void>;
}

export function createTicketPanelPublisher(
  client: Client,
  db: Pick<PrismaClient, 'ticketPanel'>,
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
