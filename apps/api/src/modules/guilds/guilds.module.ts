import { Module } from '@nestjs/common';
import { GuildAccessGuard } from '../../common/guards/guild-access.guard.js';
import { DelegatesController } from './delegates.controller.js';
import { DelegatesService } from './delegates.service.js';
import { GuildsController } from './guilds.controller.js';
import { GuildsService } from './guilds.service.js';

@Module({
  controllers: [GuildsController, DelegatesController],
  providers: [GuildsService, DelegatesService, GuildAccessGuard],
  exports: [GuildsService, GuildAccessGuard],
})
export class GuildsModule {}
