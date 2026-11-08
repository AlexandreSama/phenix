import type { PrismaClient } from '@phenix/database';
import { Events, type Client } from 'discord.js';
import type { Logger } from '../../logger.js';
import { publishRolePanel, removeRolePanelMessage } from './publish.js';
export { publishPendingRolePanels } from './publish.js';
import { rolePanelButton } from './toggle.js';
import type { ComponentHandler, SlashCommand } from '../../core/command.js';
import { gestionrole } from './commands/gestionrole.js';

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
  const ready = () =>
    client.isReady()
      ? Promise.resolve()
      : new Promise<void>((resolve) => client.once(Events.ClientReady, () => resolve()));
  return {
    async publish(panelId) {
      await ready();
      await publishRolePanel(client, db, panelId, logger);
    },
    async remove(message) {
      await ready();
      await removeRolePanelMessage(client, message, logger);
    },
  };
}
