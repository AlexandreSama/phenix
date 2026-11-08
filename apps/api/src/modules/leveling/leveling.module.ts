import { Module } from '@nestjs/common';
import { GuildsModule } from '../guilds/guilds.module.js';
import { LeaderboardController } from './leaderboard.controller.js';
import { LevelingConfigController } from './leveling.controller.js';
import { LevelingService } from './leveling.service.js';

@Module({
  imports: [GuildsModule],
  controllers: [LevelingConfigController, LeaderboardController],
  providers: [LevelingService],
})
export class LevelingModule {}
