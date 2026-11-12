import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { welcomeSettingsSchema, type ManageableGuild, type WelcomeSettings } from '@phenix/shared';
import { CurrentGuildAccess } from '../../common/decorators/current-guild-access.decorator.js';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import { WelcomeService } from './welcome.service.js';

@Controller('guilds/:guildId/welcome')
@UseGuards(AuthGuard, GuildAccessGuard)
@GuildModule('WELCOME')
export class WelcomeController {
  constructor(private readonly welcome: WelcomeService) {}

  @Get()
  get(@Param('guildId') guildId: string): Promise<WelcomeSettings> {
    return this.welcome.get(guildId);
  }

  /** Le formulaire entier, validé par le même schéma zod que le site. */
  @Put()
  save(
    @Param('guildId') guildId: string,
    @Body({ schema: welcomeSettingsSchema }) input: WelcomeSettings,
    @CurrentGuildAccess() access: ManageableGuild,
  ): Promise<WelcomeSettings> {
    return this.welcome.save(guildId, input, access);
  }
}
