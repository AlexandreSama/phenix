import { Module } from '@nestjs/common';
import { GuildsModule } from '../guilds/guilds.module.js';
import { LeaderboardController } from './leaderboard.controller.js';
import { LevelingConfigController } from './leveling.controller.js';
import { LevelingService } from './leveling.service.js';
import { XpMultipliersController } from './xp-multipliers.controller.js';

@Module({
  imports: [GuildsModule],
  controllers: [LevelingConfigController, XpMultipliersController, LeaderboardController],
  providers: [LevelingService],
})
export class LevelingModule {}
