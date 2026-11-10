/** Rôles d'inscription TD2, avec leur libellé affiché sur les boutons. */
export const TD2_ROLE_LABELS = {
  DPS: 'DPS',
  HEAL: 'Heal',
  TANK: 'Tank',
  HEAL_TANK: 'Heal/Tank',
} as const;

/** Libellés des types de sanction, affichés par le bot et le site. */
export const CASE_TYPE_LABELS = {
  WARN: 'Avertissement',
  MUTE: 'Sourdine',
  UNMUTE: 'Fin de sourdine',
  KICK: 'Expulsion',
  BAN: 'Bannissement',
  UNBAN: 'Débannissement',
} as const;

/**
 * Permissions demandées à l'invitation du bot, en entier Discord.
 * Le bot vérifie dans ses tests que ce nombre correspond à sa liste BOT_PERMISSIONS.
 */
export const BOT_INVITE_PERMISSIONS = '1099780189206';

export type CaseTypeKey = keyof typeof CASE_TYPE_LABELS;
export type Td2RoleKey = keyof typeof TD2_ROLE_LABELS;

/** Types d'activité TD2, au singulier, pour les titres et les listes. */
export const TD2_KIND_LABELS = {
  RAID: 'Raid',
  INCURSION: 'Incursion',
} as const;

export type Td2KindKey = keyof typeof TD2_KIND_LABELS;
