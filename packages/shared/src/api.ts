/** Formes des réponses de l'API, partagées avec le site. */
import type { RolePanelInput, RolePanelMode } from './schemas/role-panel.js';
import type { TicketSettingsInput } from './schemas/tickets.js';
import type {Td2KindKey, Td2PlatformKey, Td2ReportReasonKey, Td2ReportStatusKey, Td2RoleKey} from './constants.js';
/** Où en est la publication d'un panel : le bot la confirme après coup, par la base. */
export type PublicationStatus = 'published' | 'pending' | 'error';

// Td2Settings remplace l'ancienne version :
export interface Td2Settings {
  /** Salon des sorties ; null = celui où la commande est lancée */
  channelId: string | null;
  /** Salon du staff qui reçoit les signalements ; null = signalements fermés sur ce serveur */
  reportChannelId: string | null;
  reportViewerRoleIds: string[];
  /** Salon du fil des signalements confirmés du réseau ; null = aucun */
  reportFeedChannelId: string | null;
}

export interface Td2EventSummary {
  id: number;
  kind: Td2KindKey;
  activity: string;
  mode: string;
  scheduledAt: string;
  channelId: string;
  /** Inscrits confirmés, places au total, joueurs en réserve */
  confirmed: number;
  capacity: number;
  reserve: number;
}

export interface CurrentUser {
  id: string;
  username: string;
  avatarUrl: string;
  /** Listé dans BOT_OWNER_IDS : voit la page d'administration */
  isOwner: boolean;
}

/** Un serveur que l'utilisateur a le droit de gérer (« Gérer le serveur » ou propriétaire). */
export interface ManageableGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  /** Le bot est-il sur ce serveur ? Sinon, le site propose de l'inviter. */
  botPresent: boolean;
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
  /** Vrai si le transcript a été rangé dans Garage */
  hasTranscript: boolean;
}

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