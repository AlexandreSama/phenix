import type { SlashCommand } from '../../core/command.js';
import { ban } from './commands/ban.js';
import { caseCommand } from './commands/case.js';
import { clear } from './commands/clear.js';
import { clearwarn } from './commands/clearwarn.js';
import { kick } from './commands/kick.js';
import { lockCommand, unlockCommand } from './commands/lock.js';
import { mute } from './commands/mute.js';
import { sanctions } from './commands/sanctions.js';
import { unban } from './commands/unban.js';
import { unmute } from './commands/unmute.js';
import { warn } from './commands/warn.js';

export { startBanExpiry } from './ban-expiry.js';

export const moderationCommands: SlashCommand[] = [
  warn,
  mute,
  unmute,
  kick,
  ban,
  unban,
  caseCommand,
  sanctions,
  clearwarn,
  clear,
  lockCommand,
  unlockCommand,
];
