import type { PrismaClient } from '@phenix/database';
import type { Client } from 'discord.js';
import type { ComponentHandler, SlashCommand } from '../../core/command.js';
import { deleteMessageQuietly, whenReady } from '../../core/publish.js';
import type { Logger } from '../../logger.js';
import { gestionrole } from './commands/gestionrole.js';
import { publishRolePanel } from './publish.js';
import { rolePanelButton } from './toggle.js';

export { publishPendingRolePanels } from './publish.js';

export const roleCommands: SlashCommand[] = [gestionrole];

export const roleComponents: ComponentHandler[] = [rolePanelButton];

export interface RolePanelPublisher {
  publish(panelId: number): Promise<void>;
  remove(message: { channelId: string; messageId: string }): Promise<void>;
}

/** Ce que les événements du site déclenchent ; attend que le bot soit connecté avant d'agir. */
export function createRolePanelPublisher(
  client: Client,
  db: Pick<PrismaClient, 'rolePanel'>,
  logger: Pick<Logger, 'info' | 'warn'>,
): RolePanelPublisher {
  return {
    async publish(panelId) {
      await whenReady(client);
      await publishRolePanel(client, db, panelId, logger);
    },
    async remove(message) {
      await whenReady(client);
      await deleteMessageQuietly(client, message, logger);
    },
  };
}
