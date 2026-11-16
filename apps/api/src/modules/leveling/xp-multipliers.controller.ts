import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { xpMultipliersSchema, type XpMultiplierEntry } from '@phenix/shared';
import { z } from 'zod';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import { LevelingService } from './leveling.service.js';

/** Corps de la liste des bonus : une enveloppe, pour pouvoir y ajouter des champs plus tard. */
const xpMultipliersBodySchema = z.object({ multipliers: xpMultipliersSchema });

type XpMultipliersBody = z.infer<typeof xpMultipliersBodySchema>;

/** Bonus d'XP d'un serveur (rôles, salons, catégories) : onglet « Niveaux » du tableau de bord. */
@Controller('guilds/:guildId/leveling/xp-multipliers')
@UseGuards(AuthGuard, GuildAccessGuard)
@GuildModule('LEVELING')
export class XpMultipliersController {
  constructor(private readonly leveling: LevelingService) {}

  @Get()
  async get(@Param('guildId') guildId: string): Promise<{ multipliers: XpMultiplierEntry[] }> {
    return { multipliers: await this.leveling.getXpMultipliers(guildId) };
  }

  /** Remplace toute la liste ; une liste vide supprime tous les bonus. */
  @Put()
  async replace(
    @Param('guildId') guildId: string,
    @Body({ schema: xpMultipliersBodySchema }) body: XpMultipliersBody,
  ): Promise<{ multipliers: XpMultiplierEntry[] }> {
    return { multipliers: await this.leveling.replaceXpMultipliers(guildId, body.multipliers) };
  }
}
