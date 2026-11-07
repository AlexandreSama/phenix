/** Rôles d'inscription TD2, avec leur libellé affiché sur les boutons. */
export const TD2_ROLE_LABELS = {
  DPS: 'DPS',
  HEAL: 'Heal',
  TANK: 'Tank',
  HEAL_TANK: 'Heal/Tank',
} as const;

export type Td2RoleKey = keyof typeof TD2_ROLE_LABELS;
