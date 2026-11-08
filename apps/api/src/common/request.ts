import type { Request } from 'express';
import type { Session } from '../modules/auth/session.service.js';

/** Requête passée par AuthGuard : la session y est attachée. */
export interface AuthenticatedRequest extends Request {
  auth: Session;
}
