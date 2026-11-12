/** Ce qu'on écrit quand une sanction n'a pas de raison : le bot, le journal d'audit et le site le disent pareil. */
export const NO_REASON = 'Aucune raison fournie';

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
 * Utilisé par le bot et par l'API (levée depuis le site) : une seule règle.
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

/** La raison inscrite au journal d'audit du serveur : qui agit, d'où, pourquoi (512 caractères au plus). */
export function auditReason(
  actorName: string,
  reason: string | null,
  source?: 'dashboard',
): string {
  const from = source === 'dashboard' ? ' (tableau de bord)' : '';
  // Par caractère, et sans demi-paire isolée : @discordjs/rest encode la raison dans un en-tête HTTP
  // (encodeURIComponent), qui lève sur un emoji coupé en deux
  const text = `${actorName}${from} : ${reason ?? NO_REASON}`.toWellFormed();
  return Array.from(text).slice(0, 512).join('');
}
