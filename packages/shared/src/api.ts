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
