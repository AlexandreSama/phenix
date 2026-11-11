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

/** Plateformes d'un compte TD2 : le pseudo d'un joueur n'a de sens qu'avec elle. */
export const TD2_PLATFORM_LABELS = {
  UBI: 'PC (Ubisoft Connect)',
  PSN: 'PlayStation',
  XBL: 'Xbox',
} as const;

export type Td2PlatformKey = keyof typeof TD2_PLATFORM_LABELS;

/** Motifs d'un signalement : une liste fermée, pour que le fil du réseau reste lisible. */
export const TD2_REPORT_REASONS = {
  CHEAT: 'Triche',
  EXPLOIT: 'Exploit de bug',
  TOXIC: 'Comportement toxique',
  SCAM: 'Arnaque',
  OTHER: 'Autre',
} as const;

export type Td2ReportReasonKey = keyof typeof TD2_REPORT_REASONS;

/** Où en est un signalement. Hors du serveur d'origine, seuls « confirmé » et « non vérifié » existent. */
export const TD2_REPORT_STATUS_LABELS = {
  PENDING: 'Non vérifié',
  IN_REVIEW: 'En cours d’examen',
  CONFIRMED: 'Confirmé',
  REJECTED: 'Rejeté',
} as const;

export type Td2ReportStatusKey = keyof typeof TD2_REPORT_STATUS_LABELS;

/** Les preuves d'un signalement : des captures d'écran, rangées dans le bucket « evidence ». */
export const TD2_EVIDENCE_LIMITS = {
  maxFiles: 3,
  maxBytes: 8 * 1024 * 1024,
  contentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
} as const;
