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

export type CaseTypeKey = keyof typeof CASE_TYPE_LABELS;
export type Td2RoleKey = keyof typeof TD2_ROLE_LABELS;
