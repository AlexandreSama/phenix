import { Module } from '@nestjs/common';
import { GuildAdminGuard } from '../../common/guards/guild-admin.guard.js';
import { GuildsController } from './guilds.controller.js';
import { GuildsService } from './guilds.service.js';

@Module({
  controllers: [GuildsController],
  providers: [GuildsService, GuildAdminGuard],
  exports: [GuildsService, GuildAdminGuard],
})
export class GuildsModule {}
