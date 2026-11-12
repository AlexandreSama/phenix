import { checkTarget } from '@phenix/shared';
import type { GuildMember } from 'discord.js';

/** Même contrôle, à partir des membres Discord. */
export function checkMembers(moderator: GuildMember, target: GuildMember): string | null {
  return checkTarget({
    moderatorId: moderator.id,
    targetId: target.id,
    botId: target.client.user.id,
    ownerId: target.guild.ownerId,
    moderatorPosition: moderator.roles.highest.position,
    targetPosition: target.roles.highest.position,
  });
}

/** Message quand Discord refuse au bot d'agir sur un membre (rôle trop bas ou permission manquante). */
export const BOT_TOO_LOW =
  "Je n'ai pas le droit d'agir sur ce membre : place mon rôle au-dessus du sien et vérifie mes permissions.";
