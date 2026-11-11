import type { Request } from 'express';
import type { Session } from '../modules/auth/session.service.js';

/** Requête passée par AuthGuard : la session y est attachée. */
export interface AuthenticatedRequest extends Request {
  auth: Session;
}

/** Requête passée par OptionalAuthGuard : une session, ou null pour un visiteur. */
export interface MaybeAuthenticatedRequest extends Request {
  auth: Session | null;
}
