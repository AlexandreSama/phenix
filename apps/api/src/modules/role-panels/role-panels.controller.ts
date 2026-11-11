import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  rolePanelInputSchema,
  type RolePanelDetail,
  type RolePanelInput,
  type RolePanelSummary,
} from '@phenix/shared';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import { RolePanelsService } from './role-panels.service.js';

/** Un ID de panel illisible répond 404, comme un panel qui n'existe pas. */
const PanelId = new ParseIntPipe({
  exceptionFactory: () => new NotFoundException('Panel introuvable'),
});

@Controller('guilds/:guildId/role-panels')
@UseGuards(AuthGuard, GuildAccessGuard)
@GuildModule('ROLES')
export class RolePanelsController {
  constructor(private readonly panels: RolePanelsService) {}

  @Get()
  list(@Param('guildId') guildId: string): Promise<RolePanelSummary[]> {
    return this.panels.list(guildId);
  }

  @Get(':panelId')
  get(
    @Param('guildId') guildId: string,
    @Param('panelId', PanelId) panelId: number,
  ): Promise<RolePanelDetail> {
    return this.panels.get(guildId, panelId);
  }

  @Post()
  create(
    @Param('guildId') guildId: string,
    @Body({ schema: rolePanelInputSchema }) input: RolePanelInput,
  ): Promise<RolePanelDetail> {
    return this.panels.create(guildId, input);
  }

  @Put(':panelId')
  update(
    @Param('guildId') guildId: string,
    @Param('panelId', PanelId) panelId: number,
    @Body({ schema: rolePanelInputSchema }) input: RolePanelInput,
  ): Promise<RolePanelDetail> {
    return this.panels.update(guildId, panelId, input);
  }

  @Delete(':panelId')
  @HttpCode(204)
  remove(
    @Param('guildId') guildId: string,
    @Param('panelId', PanelId) panelId: number,
  ): Promise<void> {
    return this.panels.remove(guildId, panelId);
  }
}
