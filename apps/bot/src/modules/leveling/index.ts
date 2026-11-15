import type { ComponentHandler, SlashCommand } from '../../core/command.js';
import { leaderboard } from './commands/leaderboard.js';
import { levelup } from './commands/levelup.js';
import { rank } from './commands/rank.js';
import { leaderboardPageButton } from './leaderboard.js';

export { createMessageXpHandler } from './message-xp.js';

export const levelingCommands: SlashCommand[] = [rank, leaderboard, levelup];

export const levelingComponents: ComponentHandler[] = [leaderboardPageButton];
