import {
  Injectable,
  NotFoundException,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DashboardModuleKey } from '@phenix/shared';
import { GuildsService } from '../../modules/guilds/guilds.service.js';
import type { GuildRequest } from '../request.js';

/** Un onglet du tableau de bord, ou 'ANY' : n'importe lequel (listes de salons et de rôles). */
export type GuildModuleRequirement = DashboardModuleKey | 'ANY';

const GUILD_MODULE = 'guild-module';

/**
 * L'onglet du tableau de bord que servent ces routes : un membre à qui un administrateur
 * l'a ouvert y entre aussi. Sans ce décorateur, la route reste aux administrateurs.
 */
export const GuildModule = (module: GuildModuleRequirement) => SetMetadata(GUILD_MODULE, module);

/**
 * Protège les routes /guilds/:guildId/… : le bot doit être sur ce serveur, et l'utilisateur
 * doit le gérer, ou avoir reçu l'onglet de la route. À placer après AuthGuard.
 */
@Injectable()
export class GuildAccessGuard implements CanActivate {
  constructor(
    private readonly guilds: GuildsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuildRequest>();
    const guildId = request.params.guildId;
    if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) {
      throw new NotFoundException('Serveur introuvable');
    }
    // Le décorateur de la méthode passe avant celui de la classe
    const module = this.reflector.getAllAndOverride<GuildModuleRequirement | undefined>(
      GUILD_MODULE,
      [context.getHandler(), context.getClass()],
    );
    // Gardé pour les routes qui distinguent administrateur et délégué (@CurrentGuildAccess)
    request.guildAccess = await this.guilds.assertAccess(request.auth, guildId, module);
    return true;
  }
}
