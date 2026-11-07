import type { ComponentHandler, SlashCommand } from './command.js';

/** Index des commandes par nom. Refuse les doublons dès le démarrage. */
export function createCommandRegistry(commands: SlashCommand[]): Map<string, SlashCommand> {
  const registry = new Map<string, SlashCommand>();
  for (const command of commands) {
    const name = command.data.name;
    if (registry.has(name)) throw new Error(`Commande en double : /${name}`);
    registry.set(name, command);
  }
  return registry;
}

/** Index des boutons, menus et modals par préfixe de customId. */
export function createComponentRegistry(
  handlers: ComponentHandler[],
): Map<string, ComponentHandler> {
  const registry = new Map<string, ComponentHandler>();
  for (const handler of handlers) {
    if (registry.has(handler.prefix)) throw new Error(`Handler en double : ${handler.prefix}`);
    registry.set(handler.prefix, handler);
  }
  return registry;
}
