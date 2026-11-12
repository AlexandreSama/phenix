import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import {
  caseListQuerySchema,
  type CaseListQuery,
  type CasePage,
  type MemberModeration,
} from '@phenix/shared';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import { ModerationService } from './moderation.service.js';

/** Un identifiant Discord : toute autre valeur répond 404, comme un membre inconnu. */
const SNOWFLAKE = /^\d{17,20}$/;

@Controller('guilds/:guildId/moderation')
@UseGuards(AuthGuard, GuildAccessGuard)
@GuildModule('MODERATION')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('cases')
  list(
    @Param('guildId') guildId: string,
    @Query({ schema: caseListQuerySchema }) query: CaseListQuery,
  ): Promise<CasePage> {
    return this.moderation.list(guildId, query);
  }

  /** Qui il est et où il en est ; son historique est la liste filtrée par `targetId`. */
  @Get('members/:userId')
  member(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
  ): Promise<MemberModeration> {
    if (!SNOWFLAKE.test(userId)) throw new NotFoundException('Membre introuvable');
    return this.moderation.member(guildId, userId);
  }
}
