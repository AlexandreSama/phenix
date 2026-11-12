import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { GuildRequest } from '../request.js';

/**
 * L'accès de l'utilisateur au serveur de l'adresse : administrateur, ou délégué et ses onglets.
 * À utiliser derrière GuildAccessGuard.
 */
export const CurrentGuildAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<GuildRequest>().guildAccess,
);
