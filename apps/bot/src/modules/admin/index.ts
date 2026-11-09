import type { ComponentHandler, SlashCommand } from '../../core/command.js';
import { createBroadcast } from './broadcast.js';

/** Créé une seule fois : les brouillons d'annonce vivent dans ses handlers. */
const broadcast = createBroadcast();

/** Commandes des propriétaires du bot : enregistrées seulement sur le serveur de test. */
export const ownerCommands: SlashCommand[] = [broadcast.command];

export const adminComponents: ComponentHandler[] = broadcast.components;
