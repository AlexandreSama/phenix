import {
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { GuildsService } from '../../modules/guilds/guilds.service.js';
import type { AuthenticatedRequest } from '../request.js';

/**
 * Protège les routes /guilds/:guildId/… : l'utilisateur doit pouvoir gérer ce serveur,
 * et le bot doit y être. À placer après AuthGuard.
 */
@Injectable()
export class GuildAdminGuard implements CanActivate {
  constructor(private readonly guilds: GuildsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const guildId = request.params.guildId;
    if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) {
      throw new NotFoundException('Serveur introuvable');
    }
    await this.guilds.assertManageable(request.auth, guildId);
    return true;
  }
}
