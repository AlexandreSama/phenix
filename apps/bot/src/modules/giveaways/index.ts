import type { ComponentHandler, SlashCommand } from '../../core/command.js';
import { giveaway } from './commands/giveaway.js';
import { joinGiveawayButton, leaveGiveawayButton } from './join.js';

export { createGiveawayProcessor } from './processor.js';
export { resumeGiveaways } from './resume.js';

export const giveawayCommands: SlashCommand[] = [giveaway];

export const giveawayComponents: ComponentHandler[] = [joinGiveawayButton, leaveGiveawayButton];
