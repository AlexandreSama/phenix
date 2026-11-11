import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  Query,
  UseGuards,
  type PipeTransform,
} from '@nestjs/common';
import {
  guildDelegateInputSchema,
  memberSearchQuerySchema,
  type DashboardModuleKey,
  type GuildDelegate,
  type GuildMemberResult,
} from '@phenix/shared';
import { CurrentSession } from '../../common/decorators/current-session.decorator.js';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard } from '../../common/guards/guild-access.guard.js';
import type { Session } from '../auth/session.service.js';
import { DelegatesService } from './delegates.service.js';

/**
 * Un ID Discord dans l'adresse ; sinon, rien à trouver. Il reste une chaîne : un ID dépasse
 * les entiers exacts de JavaScript, ParseIntPipe l'arrondirait.
 */
const UserId: PipeTransform<string, string> = {
  transform(value) {
    if (!/^\d{17,20}$/.test(value)) throw new NotFoundException('Membre introuvable');
    return value;
  },
};

/**
 * L'onglet « Accès » : ouvrir des onglets du tableau de bord à des membres du serveur.
 * Pas de @GuildModule : seuls ses administrateurs délèguent, un délégué ne délègue pas.
 */
@Controller('guilds/:guildId')
@UseGuards(AuthGuard, GuildAccessGuard)
export class DelegatesController {
  constructor(private readonly delegates: DelegatesService) {}

  @Get('delegates')
  list(@Param('guildId') guildId: string): Promise<GuildDelegate[]> {
    return this.delegates.list(guildId);
  }

  @Get('members')
  search(
    @CurrentSession() session: Session,
    @Param('guildId') guildId: string,
    @Query({ schema: memberSearchQuerySchema }) { q }: { q: string },
  ): Promise<GuildMemberResult[]> {
    return this.delegates.search(session, guildId, q);
  }

  @Put('delegates/:userId')
  save(
    @CurrentSession() session: Session,
    @Param('guildId') guildId: string,
    @Param('userId', UserId) userId: string,
    @Body({ schema: guildDelegateInputSchema }) input: { modules: DashboardModuleKey[] },
  ): Promise<GuildDelegate> {
    return this.delegates.save(session, guildId, userId, input.modules);
  }

  @Delete('delegates/:userId')
  @HttpCode(204)
  remove(
    @Param('guildId') guildId: string,
    @Param('userId', UserId) userId: string,
  ): Promise<void> {
    return this.delegates.remove(guildId, userId);
  }
}
