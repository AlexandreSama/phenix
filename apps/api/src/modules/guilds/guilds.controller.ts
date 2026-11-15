import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type {
  GuildCategorySummary,
  GuildChannelSummary,
  GuildRoleSummary,
  ManageableGuild,
} from '@phenix/shared';
import { CurrentSession } from '../../common/decorators/current-session.decorator.js';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import type { Session } from '../auth/session.service.js';
import { GuildsService } from './guilds.service.js';

@Controller('guilds')
@UseGuards(AuthGuard)
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  @Get()
  list(@CurrentSession() session: Session): Promise<ManageableGuild[]> {
    return this.guilds.listManageable(session);
  }

  // Salons, catégories et rôles : chaque onglet en a besoin pour ses listes
  @Get(':guildId/channels')
  @UseGuards(GuildAccessGuard)
  @GuildModule('ANY')
  channels(@Param('guildId') guildId: string): Promise<GuildChannelSummary[]> {
    return this.guilds.channels(guildId);
  }

  // Salons vocaux et de scène : même forme que les salons texte
  @Get(':guildId/voice-channels')
  @UseGuards(GuildAccessGuard)
  @GuildModule('ANY')
  voice(@Param('guildId') guildId: string): Promise<GuildChannelSummary[]> {
    return this.guilds.voice(guildId);
  }

  // Forums et salons média : même forme que les salons texte
  @Get(':guildId/forum-channels')
  @UseGuards(GuildAccessGuard)
  @GuildModule('ANY')
  forums(@Param('guildId') guildId: string): Promise<GuildChannelSummary[]> {
    return this.guilds.forums(guildId);
  }

  @Get(':guildId/categories')
  @UseGuards(GuildAccessGuard)
  @GuildModule('ANY')
  categories(@Param('guildId') guildId: string): Promise<GuildCategorySummary[]> {
    return this.guilds.categories(guildId);
  }

  @Get(':guildId/roles')
  @UseGuards(GuildAccessGuard)
  @GuildModule('ANY')
  roles(@Param('guildId') guildId: string): Promise<GuildRoleSummary[]> {
    return this.guilds.roles(guildId);
  }
}
