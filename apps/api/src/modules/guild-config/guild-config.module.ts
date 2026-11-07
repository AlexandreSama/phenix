import { Module } from '@nestjs/common';
import { GuildsModule } from '../guilds/guilds.module.js';
import { GuildConfigController } from './guild-config.controller.js';
import { GuildConfigService } from './guild-config.service.js';

@Module({
  imports: [GuildsModule],
  controllers: [GuildConfigController],
  providers: [GuildConfigService],
})
export class GuildConfigModule {}
