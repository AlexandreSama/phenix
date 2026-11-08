import { Module } from '@nestjs/common';
import { GuildsModule } from '../guilds/guilds.module.js';
import { RolePanelsController } from './role-panels.controller.js';
import { RolePanelsService } from './role-panels.service.js';

@Module({
  imports: [GuildsModule],
  controllers: [RolePanelsController],
  providers: [RolePanelsService],
})
export class RolePanelsModule {}
