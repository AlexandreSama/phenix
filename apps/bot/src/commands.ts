import type { SlashCommand } from './core/command.js';
import { hug, meurtre, punch } from './modules/fun/commands/actions.js';
import { avatar } from './modules/fun/commands/avatar.js';
import { eightBall } from './modules/fun/commands/eight-ball.js';
import { ship } from './modules/fun/commands/ship.js';
import { botinfos } from './modules/utils/commands/botinfos.js';
import { botinvite } from './modules/utils/commands/botinvite.js';
import { ping } from './modules/utils/commands/ping.js';
import { serverinfos } from './modules/utils/commands/serverinfos.js';
import { moderationCommands } from './modules/moderation/index.js';

/** Toutes les slash commands du bot. Une nouvelle commande s'ajoute ici. */
export const commands: SlashCommand[] = [
  // Utils
  ping,
  botinfos,
  botinvite,
  serverinfos,
  // Fun
  avatar,
  eightBall,
  ship,
  hug,
  punch,
  meurtre,
  // Modération
  ...moderationCommands,
];
