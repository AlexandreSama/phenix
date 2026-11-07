import type { GuildMember } from 'discord.js';

export interface TargetCheck {
  moderatorId: string;
  targetId: string;
  botId: string;
  ownerId: string;
  /** Position du rôle le plus haut de chacun (0 = @everyone) */
  moderatorPosition: number;
  targetPosition: number;
}

/**
 * Discord vérifie que le bot a le droit d'agir, pas que le modérateur est au-dessus de sa cible.
 * C'est à nous de l'empêcher : sans ce contrôle, un modérateur pourrait bannir un admin via le bot.
 * Renvoie le message de refus, ou null si la sanction est permise.
 */
export function checkTarget(check: TargetCheck): string | null {
  if (check.targetId === check.moderatorId) return 'Tu ne peux pas te sanctionner toi-même.';
  if (check.targetId === check.botId) return 'Je ne vais pas me sanctionner moi-même.';
  if (check.targetId === check.ownerId) {
    return 'Impossible de sanctionner le propriétaire du serveur.';
  }
  if (check.moderatorId !== check.ownerId && check.targetPosition >= check.moderatorPosition) {
    return 'Ce membre a un rôle égal ou supérieur au tien.';
  }
  return null;
}

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
