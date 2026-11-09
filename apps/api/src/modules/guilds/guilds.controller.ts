import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { GuildChannelSummary, GuildRoleSummary, ManageableGuild } from '@phenix/shared';
import { CurrentSession } from '../../common/decorators/current-session.decorator.js';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAdminGuard } from '../../common/guards/guild-admin.guard.js';
import type { Session } from '../auth/session.service.js';
import { GuildsService } from './guilds.service.js';
import type { GuildCategorySummary } from '@phenix/shared';

@Controller('guilds')
@UseGuards(AuthGuard)
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  @Get()
  list(@CurrentSession() session: Session): Promise<ManageableGuild[]> {
    return this.guilds.listManageable(session);
  }

  @Get(':guildId/channels')
  @UseGuards(GuildAdminGuard)
  channels(@Param('guildId') guildId: string): Promise<GuildChannelSummary[]> {
    return this.guilds.channels(guildId);
  }

  @Get(':guildId/roles')
  @UseGuards(GuildAdminGuard)
  roles(@Param('guildId') guildId: string): Promise<GuildRoleSummary[]> {
    return this.guilds.roles(guildId);
  }

  @Get(':guildId/categories')
  @UseGuards(GuildAdminGuard)
  categories(@Param('guildId') guildId: string): Promise<GuildCategorySummary[]> {
    return this.guilds.categories(guildId);
  }
}
