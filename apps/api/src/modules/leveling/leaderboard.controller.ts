import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  leaderboardQuerySchema,
  type LeaderboardPage,
  type LeaderboardQuery,
} from '@phenix/shared';
import { LevelingService } from './leveling.service.js';

/** Classement public : aucune connexion demandée, c'est la page qu'on partage. */
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leveling: LevelingService) {}

  @Get(':guildId')
  get(
    @Param('guildId') guildId: string,
    @Query({ schema: leaderboardQuerySchema }) query: LeaderboardQuery,
  ): Promise<LeaderboardPage> {
    if (!/^\d{17,20}$/.test(guildId)) throw new NotFoundException('Serveur introuvable');
    return this.leveling.leaderboard(guildId, query.page);
  }
}
