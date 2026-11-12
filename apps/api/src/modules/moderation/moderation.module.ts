import { Module } from '@nestjs/common';
import { GuildsModule } from '../guilds/guilds.module.js';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { UserDirectory } from './user-directory.js';

@Module({
  imports: [GuildsModule],
  controllers: [ModerationController],
  providers: [ModerationService, UserDirectory],
})
export class ModerationModule {}
