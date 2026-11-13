import type {
  DashboardModuleKey,
  ForumRoleKey,
  Td2DifficultyKey,
  Td2EventKindKey,
  Td2KindKey,
  Td2PlatformKey,
  Td2ReportReasonKey,
  Td2ReportStatusKey,
  Td2RoleKey,
} from './constants.js';
import type { MetricsRange, ServiceHeartbeat } from './metrics.js';
import type { RolePanelInput, RolePanelMode } from './schemas/role-panel.js';
import type { TicketSettingsInput, TicketTypeInput } from './schemas/tickets.js';

/** Formes des réponses de l'API, partagées avec le site. */

export interface CurrentUser {
  id: string;
  username: string;
  avatarUrl: string;
  /** Listé dans BOT_OWNER_IDS : voit la page d'administration */
  isOwner: boolean;
  /** Son rôle sur le forum (phase 8) */
  forumRole: ForumRoleKey;
}

/**
 * Un serveur que l'utilisateur peut régler : il le gère (« Gérer le serveur » ou propriétaire),
 * ou un administrateur lui a ouvert certains onglets.
 */
export interface ManageableGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  /** Le bot est-il sur ce serveur ? Sinon, le site propose de l'inviter. */
  botPresent: boolean;
  /** 'admin' : tous les onglets, et la gestion des accès ; 'delegate' : ceux qu'on lui a ouverts */
  access: 'admin' | 'delegate';
  /** Les onglets qu'il peut ouvrir : tous pour un administrateur */
  modules: DashboardModuleKey[];
}

/** Un membre à qui un administrateur a ouvert des onglets du tableau de bord. */
export interface GuildDelegate {
  userId: string;
  username: string;
  avatarUrl: string;
  modules: DashboardModuleKey[];
  /** L'administrateur qui a donné (ou changé en dernier) l'accès */
  grantedById: string;
  updatedAt: string;
}

/** Un membre trouvé par la recherche, à qui on peut ouvrir des onglets. */
export interface GuildMemberResult {
  id: string;
  username: string;
  /** Son nom affiché sur ce serveur (surnom, sinon nom global), s'il diffère du pseudo */
  displayName: string | null;
  avatarUrl: string;
}

export interface GuildChannelSummary {
  id: string;
  name: string;
  /** Catégorie Discord, pour regrouper les salons dans les listes */
  parentName: string | null;
}

/** Une catégorie de salons, où le bot range les tickets. */
export interface GuildCategorySummary {
  id: string;
  name: string;
}

export interface GuildRoleSummary {
  id: string;
  name: string;
  /** Couleur du rôle en hexadécimal, ou null s'il n'en a pas */
  color: string | null;
  /** Le bot peut-il le distribuer par un panel ? */
  assignable: boolean;
  /** Pourquoi il ne peut pas, affiché sur le site ; null s'il peut */
  blockedReason: string | null;
}

/** Corps d'une réponse d'erreur de l'API (format NestJS). */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
}

/** Une ligne du classement public. La progression se recalcule avec levelProgress(xp). */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  messages: number;
}

export interface LeaderboardPage {
  guild: { id: string; name: string; iconUrl: string | null };
  entries: LeaderboardEntry[];
  /** Page renvoyée, de 1 à pageCount : une page trop loin renvoie la dernière */
  page: number;
  pageCount: number;
  /** Membres ayant au moins 1 XP */
  totalMembers: number;
}

/** Où en est la publication d'un panel : le bot la confirme après coup, par la base. */
export type PublicationStatus = 'published' | 'pending' | 'error';

export interface RolePanelSummary {
  id: number;
  title: string;
  channelId: string;
  mode: RolePanelMode;
  optionCount: number;
  status: PublicationStatus;
  publishError: string | null;
}

export interface RolePanelDetail extends RolePanelInput {
  id: number;
  status: PublicationStatus;
  publishError: string | null;
}

/** Les réglages des tickets, avec l'état de publication du panel. */
export interface TicketSettings extends TicketSettingsInput {
  panelStatus: PublicationStatus;
  panelError: string | null;
}

/**
 * Réponse de GET /tickets/settings. `settings` vaut null tant que rien n'est réglé :
 * on enveloppe, car Nest répondrait un corps vide pour un null seul.
 */
export interface TicketSettingsResponse {
  settings: TicketSettings | null;
}

/** Un type de ticket dans la liste de l'onglet « Tickets ». */
export interface TicketTypeSummary {
  id: number;
  name: string;
  description: string | null;
  emoji: string | null;
  categoryId: string;
  staffRoleIds: string[];
  /** Heures sans message avant la fermeture automatique ; null : désactivée */
  inactivityHours: number | null;
  questionCount: number;
}

/** Un type de ticket en entier, avec ses questions dans l'ordre. */
export interface TicketTypeDetail extends TicketTypeInput {
  id: number;
}

export interface TicketSummary {
  id: number;
  number: number;
  ownerId: string;
  ownerName: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  closedAt: string | null;
  closedByName: string | null;
  messageCount: number | null;
  /** Nom du type du ticket ; null pour un ticket sans type (type supprimé depuis) */
  typeName: string | null;
  /** Pseudo de la personne qui a pris le ticket en charge ; null tant que personne ne l'a pris */
  claimedByName: string | null;
  /** Comment le ticket a été fermé : null tant qu'il est ouvert, ou s'il a été fermé avant ce suivi */
  closedVia: 'BUTTON' | 'INACTIVITY' | 'CHANNEL_DELETED' | null;
  /** Vrai si le transcript a été rangé dans Garage */
  hasTranscript: boolean;
}

/**
 * Nombres de notes et moyennes EXACTS, lus en base, par type et par personne qui a pris les
 * tickets en charge. Reste côté serveur : jamais envoyé au site (voir `maskRatingStats`).
 */
export interface RawTicketStats {
  types: {
    typeId: number | null;
    typeName: string | null;
    count: number;
    average: number | null;
  }[];
  members: {
    claimedById: string;
    claimedByName: string | null;
    count: number;
    average: number | null;
  }[];
}

/**
 * Ce que le site reçoit : des moyennes seulement, sans nombre de notes ni identifiant Discord.
 * `average` vaut null sous TICKET_RATING_MIN_COUNT notes, sinon elle est arrondie au dixième :
 * jamais la note d'un ticket, ni de quoi la retrouver en comparant deux lectures.
 */
export interface TicketStats {
  types: {
    typeId: number | null;
    typeName: string | null;
    average: number | null;
  }[];
  members: {
    claimedByName: string | null;
    average: number | null;
  }[];
}

/** GET /guilds/:guildId/tickets/stats : l'onglet Tickets, ouvert aussi aux accès délégués. */
export type TicketTypeStats = Pick<TicketStats, 'types'>;

/** GET /guilds/:guildId/tickets/stats/members : réservé aux administrateurs du serveur. */
export type TicketMemberStats = Pick<TicketStats, 'members'>;

export interface TicketPage {
  tickets: TicketSummary[];
  page: number;
  pageCount: number;
  total: number;
}

export interface GiveawayWinner {
  id: string;
  /** Pseudo au moment de la participation ; l'ID si le membre n'en avait pas */
  name: string;
}

export interface GiveawaySummary {
  id: number;
  prize: string;
  channelId: string;
  winnersCount: number;
  requiredRoleId: string | null;
  endsAt: string;
  /** Rempli quand le tirage est fait */
  endedAt: string | null;
  /** Faux tant que le message final et les félicitations ne sont pas partis */
  announced: boolean;
  entryCount: number;
  winners: GiveawayWinner[];
  publication: PublicationStatus;
  publishError: string | null;
}

export interface GiveawayPage {
  giveaways: GiveawaySummary[];
  page: number;
  pageCount: number;
  total: number;
}

export interface Td2Settings {
  /** Salon des sorties ; null = celui où la commande est lancée */
  channelId: string | null;
  /** Sorties affichées sur la page publique /sorties */
  publicListing: boolean;
  /** Salon du staff qui reçoit les signalements ; null = signalements fermés sur ce serveur */
  reportChannelId: string | null;
  reportViewerRoleIds: string[];
  /** Salon du fil des signalements confirmés du réseau ; null = aucun */
  reportFeedChannelId: string | null;
}

export interface Td2EventSummary {
  id: number;
  kind: Td2EventKindKey;
  /** L'activité (« Dark Hours »), ou le nom donné à la mission */
  activity: string;
  /** Le mode de l'activité ; null pour une mission */
  mode: string | null;
  /** Mission : sa difficulté et ses directives (null et [] sinon) */
  difficulty: Td2DifficultyKey | null;
  directives: string[];
  scheduledAt: string;
  channelId: string;
  /** Inscrits confirmés, places au total, joueurs en réserve */
  confirmed: number;
  capacity: number;
  reserve: number;
}

/** Une sortie sur la page publique : celles des serveurs qui ont choisi de se montrer. */
export interface PublicTd2Event extends Omit<Td2EventSummary, 'channelId'> {
  guild: { id: string; name: string; iconUrl: string | null };
}

/** Une directive de mission, gérée par les propriétaires du bot. */
export interface Td2Directive {
  id: number;
  name: string;
  description: string | null;
  /** Désactivée, le bot ne la propose plus ; les missions qui l'ont gardent son nom */
  active: boolean;
}

/** Un mode du catalogue, avec le nombre de sorties qui l'utilisent (un mode utilisé ne se supprime pas). */
export interface Td2CatalogueMode {
  id: number;
  name: string;
  slots: Record<Td2RoleKey, number>;
  eventCount: number;
}

export interface Td2CatalogueActivity {
  id: number;
  kind: Td2KindKey;
  name: string;
  active: boolean;
  modes: Td2CatalogueMode[];
}

/** Un signalement vu par l'administration : jamais le pseudo Discord de l'auteur. */
export interface Td2ReportAdminSummary {
  id: number;
  guildId: string;
  guildName: string;
  playerName: string;
  platform: Td2PlatformKey;
  reason: Td2ReportReasonKey;
  details: string | null;
  status: Td2ReportStatusKey;
  evidenceCount: number;
  createdAt: string;
  reviewedAt: string | null;
}

export interface Td2ReportAdminPage {
  reports: Td2ReportAdminSummary[];
  /** À passer en `cursor` pour la page suivante ; null = fin de la liste */
  nextCursor: number | null;
}

// ---------- Forum (phase 8) ----------

/** L'auteur d'un sujet ou d'un message, tel que le forum l'affiche. */
export interface ForumAuthor {
  id: string;
  username: string;
  avatarUrl: string;
  role: ForumRoleKey;
}

export interface ForumCategorySummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  position: number;
  threadCount: number;
  /** Le dernier message posté dans la catégorie ; null si elle est vide */
  lastActivityAt: string | null;
}

export interface ForumThreadSummary {
  id: number;
  title: string;
  pinned: boolean;
  locked: boolean;
  author: ForumAuthor;
  /** Les messages après le premier */
  replyCount: number;
  createdAt: string;
  lastActivityAt: string;
}

/** Une page de la liste des sujets d'une catégorie. */
export interface ForumCategoryPage {
  category: Pick<ForumCategorySummary, 'id' | 'slug' | 'name' | 'description'>;
  threads: ForumThreadSummary[];
  page: number;
  pageCount: number;
  /** Connecté : peut ouvrir un sujet */
  canPost: boolean;
}

export interface ForumPostView {
  id: number;
  author: ForumAuthor;
  /** Le Markdown d'origine, pour le formulaire de modification */
  content: string;
  /** Le HTML rendu et assaini par l'API : le site l'affiche tel quel */
  html: string;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

/** Une page d'un sujet. */
export interface ForumThreadView {
  id: number;
  title: string;
  pinned: boolean;
  locked: boolean;
  category: { slug: string; name: string };
  posts: ForumPostView[];
  page: number;
  pageCount: number;
  canReply: boolean;
  canModerate: boolean;
}

/** Ce que renvoie la création d'un sujet ou d'une réponse : où aller la voir. */
export interface ForumPostCreated {
  threadId: number;
  postId: number;
  page: number;
}

/** Une image envoyée, ré-encodée et prête à être insérée dans un message. */
export interface ForumImage {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface ForumMarkdownPreview {
  html: string;
}

/** Un membre du site, vu par l'administration du forum. */
export interface ForumMember {
  id: string;
  username: string;
  avatarUrl: string;
  role: ForumRoleKey;
}

// ---------- Métriques (phase 11) ----------

/** Un service vu par la page Métriques : hors ligne si son battement manque. */
export type ServiceStatus = { online: true; heartbeat: ServiceHeartbeat } | { online: false };

/** Les commandes lancées sur une plage, et sur combien de serveurs. */
export interface CommandTotals {
  count: number;
  errors: number;
  guilds: number;
}

export interface StorageBucket {
  name: string;
  bytes: number;
  objects: number;
}

/**
 * Le haut de la page : l'état en direct, le stockage, les totaux. Postgres et Valkey sont lus
 * en direct ; Garage vient du dernier relevé (seul le bot a le jeton d'administration).
 */
export interface MetricsOverview {
  services: Record<'bot' | 'api', ServiceStatus>;
  commands: Record<MetricsRange, CommandTotals>;
  storage: {
    /** Date du dernier relevé du stockage (Garage) ; null tant qu'il n'y en a pas */
    takenAt: string | null;
    /** null : la base n'a pas répondu à temps */
    postgres: { bytes: number | null; tables: { name: string; bytes: number }[] };
    /** maxBytes null : Valkey n'a pas de plafond (maxmemory 0) */
    valkey: { bytes: number | null; maxBytes: number | null };
    garage: StorageBucket[];
  };
}

export interface CommandStat {
  /** Avec la sous-commande : « td2 mission » */
  command: string;
  count: number;
  errors: number;
  avgDurationMs: number;
}

export interface CommandMetrics {
  range: MetricsRange;
  commands: CommandStat[];
  /** Le total par jour (heure de Paris), du plus ancien au plus récent ; jour = AAAA-MM-JJ */
  daily: { day: string; count: number; errors: number }[];
}

export interface GuildStat {
  /** '' : les commandes lancées hors serveur, en message privé */
  id: string;
  /** null : un serveur que le bot ne connaît plus */
  name: string | null;
  iconUrl: string | null;
  count: number;
  topCommand: string;
  lastActiveAt: string;
}

export interface GuildMetrics {
  range: MetricsRange;
  guilds: GuildStat[];
}

export interface MetricSeriesPoint {
  at: string;
  value: number;
}

export interface MetricSeries {
  range: MetricsRange;
  /** Le pas des points, en minutes : 5 sur 24 h, 60 sur 7 jours, 240 sur 30 jours */
  binMinutes: number;
  series: { name: string; points: MetricSeriesPoint[] }[];
}
