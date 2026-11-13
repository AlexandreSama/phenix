import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  generalConfigPatchSchema,
  type GeneralConfig,
  type GeneralConfigPatch,
  type ManageableGuild,
} from '@phenix/shared';
import { CurrentGuildAccess } from '../../common/decorators/current-guild-access.decorator.js';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import { GuildConfigService } from './guild-config.service.js';

@Controller('guilds/:guildId/config')
@UseGuards(AuthGuard, GuildAccessGuard)
@GuildModule('GENERAL')
export class GuildConfigController {
  constructor(private readonly config: GuildConfigService) {}

  @Get()
  get(@Param('guildId') guildId: string): Promise<GeneralConfig> {
    return this.config.get(guildId);
  }

  /** Le corps est validé par le même schéma zod que le formulaire du site. */
  @Patch()
  update(
    @Param('guildId') guildId: string,
    @CurrentGuildAccess() guild: ManageableGuild,
    @Body({ schema: generalConfigPatchSchema }) patch: GeneralConfigPatch,
  ): Promise<GeneralConfig> {
    return this.config.update(guildId, patch, guild.access);
  }
}
