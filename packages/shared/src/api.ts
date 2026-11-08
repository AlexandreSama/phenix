/** Formes des réponses de l'API, partagées avec le site. */

export interface CurrentUser {
  id: string;
  username: string;
  avatarUrl: string;
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

export interface GuildRoleSummary {
  id: string;
  name: string;
  /** Couleur du rôle en hexadécimal, ou null s'il n'en a pas */
  color: string | null;
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
