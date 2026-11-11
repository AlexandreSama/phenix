import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  td2SettingsSchema,
  type Td2EventSummary,
  type Td2Settings,
  type Td2SettingsInput,
} from '@phenix/shared';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import { Td2Service } from './td2.service.js';

@Controller('guilds/:guildId/td2')
@UseGuards(AuthGuard, GuildAccessGuard)
@GuildModule('TD2')
export class Td2Controller {
  constructor(private readonly td2: Td2Service) {}

  @Get('settings')
  settings(@Param('guildId') guildId: string): Promise<Td2Settings> {
    return this.td2.getSettings(guildId);
  }

  @Put('settings')
  saveSettings(
    @Param('guildId') guildId: string,
    @Body({ schema: td2SettingsSchema }) input: Td2SettingsInput,
  ): Promise<Td2Settings> {
    return this.td2.saveSettings(guildId, input);
  }

  @Get('events')
  events(@Param('guildId') guildId: string): Promise<Td2EventSummary[]> {
    return this.td2.upcoming(guildId);
  }
}
