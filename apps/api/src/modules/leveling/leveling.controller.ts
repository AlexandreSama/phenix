import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  levelingConfigPatchSchema,
  type LevelingConfig,
  type LevelingConfigPatch,
} from '@phenix/shared';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAdminGuard } from '../../common/guards/guild-admin.guard.js';
import { LevelingService } from './leveling.service.js';

/** Réglages XP d'un serveur : page « Niveaux » du tableau de bord. */
@Controller('guilds/:guildId/leveling')
@UseGuards(AuthGuard, GuildAdminGuard)
export class LevelingConfigController {
  constructor(private readonly leveling: LevelingService) {}

  @Get()
  get(@Param('guildId') guildId: string): Promise<LevelingConfig> {
    return this.leveling.getConfig(guildId);
  }

  @Patch()
  update(
    @Param('guildId') guildId: string,
    @Body({ schema: levelingConfigPatchSchema }) patch: LevelingConfigPatch,
  ): Promise<LevelingConfig> {
    return this.leveling.updateConfig(guildId, patch);
  }
}
