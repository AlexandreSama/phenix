import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { SessionService } from '../../modules/auth/session.service.js';
import { SESSION_COOKIE } from '../cookies.js';
import type { MaybeAuthenticatedRequest } from '../request.js';

/**
 * Pour les pages publiques qui changent selon qui regarde (le forum) : laisse toujours passer,
 * et attache la session à la requête quand il y en a une.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MaybeAuthenticatedRequest>();
    const sessionId: unknown = request.cookies?.[SESSION_COOKIE];
    request.auth = typeof sessionId === 'string' ? await this.sessions.get(sessionId) : null;
    return true;
  }
}
