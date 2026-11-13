import { Module } from '@nestjs/common';
import { GuildsModule } from '../guilds/guilds.module.js';
import { MemberSearch } from './member-search.js';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { UserDirectory } from './user-directory.js';

@Module({
  imports: [GuildsModule],
  controllers: [ModerationController],
  providers: [ModerationService, MemberSearch, UserDirectory],
})
export class ModerationModule {}
