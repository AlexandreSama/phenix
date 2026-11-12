/** Rôles d'inscription TD2, avec leur libellé affiché sur les boutons. */
export const TD2_ROLE_LABELS = {
  DPS: 'DPS',
  HEAL: 'Heal',
  TANK: 'Tank',
  HEAL_TANK: 'Heal/Tank',
} as const;

export type Td2RoleKey = keyof typeof TD2_ROLE_LABELS;

/** Tous les rôles d'inscription : ceux d'une escouade, plus la place sans rôle d'une mission. */
export const TD2_SIGNUP_ROLE_LABELS = { ...TD2_ROLE_LABELS, PLAYER: 'Joueur' } as const;

export type Td2SignupRoleKey = keyof typeof TD2_SIGNUP_ROLE_LABELS;

/** Types d'activité TD2, au singulier, pour les titres et les listes. */
export const TD2_KIND_LABELS = {
  RAID: 'Raid',
  INCURSION: 'Incursion',
} as const;

export type Td2KindKey = keyof typeof TD2_KIND_LABELS;

/** Les types de sortie : les activités du catalogue, plus la mission, que l'organisateur nomme. */
export const TD2_EVENT_KIND_LABELS = { ...TD2_KIND_LABELS, MISSION: 'Mission' } as const;

export type Td2EventKindKey = keyof typeof TD2_EVENT_KIND_LABELS;

/** Les difficultés d'une mission, de la plus douce à la plus dure. */
export const TD2_DIFFICULTY_LABELS = {
  NORMAL: 'Normal',
  HARD: 'Difficile',
  CHALLENGING: 'Exigeant',
  HEROIC: 'Héroïque',
  LEGENDARY: 'Légendaire',
} as const;

export type Td2DifficultyKey = keyof typeof TD2_DIFFICULTY_LABELS;

/** Une mission : un nom libre, et une escouade de 4 joueurs au plus, comme en jeu. */
export const TD2_MISSION_LIMITS = { nameMax: 80, maxPlayers: 4 } as const;

/**
 * Les directives, gérées par les propriétaires du bot. Le bot les propose dans un menu
 * Discord, qui ne prend pas plus de 25 choix.
 */
export const TD2_DIRECTIVE_LIMITS = { nameMax: 40, descriptionMax: 100, maxActive: 25 } as const;

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

/** Les rôles sur le forum du site. Les propriétaires du bot ont tous les droits, quel que soit le leur. */
export const FORUM_ROLE_LABELS = {
  MEMBER: 'Membre',
  MODERATOR: 'Modérateur',
  ADMIN: 'Administrateur',
} as const;

export type ForumRoleKey = keyof typeof FORUM_ROLE_LABELS;

/** Les limites du forum, communes au site (qui prévient) et à l'API (qui refuse). */
export const FORUM_LIMITS = {
  titleMax: 120,
  contentMax: 10_000,
  /** Poids maximal d'une image envoyée, avant ré-encodage */
  imageMaxBytes: 8 * 1024 * 1024,
  /** Au-delà, l'image est réduite, proportions gardées */
  imageMaxSide: 2048,
  threadsPerPage: 20,
  postsPerPage: 20,
} as const;

/** Les onglets du tableau de bord d'un serveur, qu'un administrateur peut ouvrir à un membre. */
export const DASHBOARD_MODULE_LABELS = {
  GENERAL: 'Général',
  LEVELING: 'Niveaux',
  ROLES: 'Rôles',
  TICKETS: 'Tickets',
  GIVEAWAYS: 'Giveaways',
  TD2: 'The Division 2',
  WELCOME: 'Bienvenue',
  MODERATION: 'Modération',
} as const;

export type DashboardModuleKey = keyof typeof DASHBOARD_MODULE_LABELS;

export const DASHBOARD_MODULES = Object.keys(DASHBOARD_MODULE_LABELS) as [
  DashboardModuleKey,
  ...DashboardModuleKey[],
];

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

/** Libellés du statut d'une sanction (« levée » comme dans le bot, jamais « révoquée »). */
export const CASE_STATUS_LABELS = {
  active: 'Active',
  revoked: 'Levée',
  ended: 'Terminée',
} as const;

export type CaseStatusKey = keyof typeof CASE_STATUS_LABELS;

/**
 * Permissions demandées à l'invitation du bot, en entier Discord.
 * Le bot vérifie dans ses tests que ce nombre correspond à sa liste BOT_PERMISSIONS.
 */
export const BOT_INVITE_PERMISSIONS = '1099780189207';
