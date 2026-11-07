import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { SessionService } from '../../modules/auth/session.service.js';
import { SESSION_COOKIE } from '../cookies.js';
import type { AuthenticatedRequest } from '../request.js';

/** Refuse la requête sans session valide, et attache la session à la requête. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionId: unknown = request.cookies?.[SESSION_COOKIE];
    const session = typeof sessionId === 'string' ? await this.sessions.get(sessionId) : null;
    if (!session) throw new UnauthorizedException('Connexion requise');

    request.auth = session;
    return true;
  }
}
