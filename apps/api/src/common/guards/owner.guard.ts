import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ENV } from '../../core/tokens.js';
import type { Env } from '../../env.js';
import type { AuthenticatedRequest } from '../request.js';

/**
 * Protège la page d'administration : seuls les propriétaires du bot (BOT_OWNER_IDS) passent.
 * À placer après AuthGuard, qui attache la session à la requête.
 */
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!this.env.BOT_OWNER_IDS.includes(request.auth.userId)) {
      throw new ForbiddenException('Réservé aux propriétaires du bot');
    }
    return true;
  }
}
