import type { ManageableGuild } from '@phenix/shared';
import type { Request } from 'express';
import type { Session } from '../modules/auth/session.service.js';

/** Requête passée par AuthGuard : la session y est attachée. */
export interface AuthenticatedRequest extends Request {
  auth: Session;
}

/** Requête passée par GuildAccessGuard : l'accès de l'utilisateur au serveur y est attaché. */
export interface GuildRequest extends AuthenticatedRequest {
  guildAccess: ManageableGuild;
}

/** Requête passée par OptionalAuthGuard : une session, ou null pour un visiteur. */
export interface MaybeAuthenticatedRequest extends Request {
  auth: Session | null;
}
