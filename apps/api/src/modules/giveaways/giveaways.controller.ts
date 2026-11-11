import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  giveawayInputSchema,
  giveawayListQuerySchema,
  type GiveawayInput,
  type GiveawayListQuery,
  type GiveawayPage,
  type GiveawaySummary,
} from '@phenix/shared';
import { CurrentSession } from '../../common/decorators/current-session.decorator.js';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import type { Session } from '../auth/session.service.js';
import { GiveawaysService } from './giveaways.service.js';

const GiveawayId = new ParseIntPipe({
  exceptionFactory: () => new NotFoundException('Giveaway introuvable'),
});

@Controller('guilds/:guildId/giveaways')
@UseGuards(AuthGuard, GuildAccessGuard)
@GuildModule('GIVEAWAYS')
export class GiveawaysController {
  constructor(private readonly giveaways: GiveawaysService) {}

  @Get()
  list(
    @Param('guildId') guildId: string,
    @Query({ schema: giveawayListQuerySchema }) query: GiveawayListQuery,
  ): Promise<GiveawayPage> {
    return this.giveaways.list(guildId, query);
  }

  /** L'organisateur affiché sur Discord est l'admin connecté au site. */
  @Post()
  create(
    @Param('guildId') guildId: string,
    @CurrentSession() session: Session,
    @Body({ schema: giveawayInputSchema }) input: GiveawayInput,
  ): Promise<GiveawaySummary> {
    return this.giveaways.create(guildId, session.userId, input);
  }

  /** 202 : la demande est dans la file, le bot fait le tirage dans l'instant. */
  @Post(':giveawayId/end')
  @HttpCode(202)
  end(
    @Param('guildId') guildId: string,
    @Param('giveawayId', GiveawayId) giveawayId: number,
  ): Promise<void> {
    return this.giveaways.end(guildId, giveawayId);
  }

  @Post(':giveawayId/reroll')
  @HttpCode(202)
  reroll(
    @Param('guildId') guildId: string,
    @Param('giveawayId', GiveawayId) giveawayId: number,
  ): Promise<void> {
    return this.giveaways.reroll(guildId, giveawayId);
  }

  @Delete(':giveawayId')
  @HttpCode(204)
  remove(
    @Param('guildId') guildId: string,
    @Param('giveawayId', GiveawayId) giveawayId: number,
  ): Promise<void> {
    return this.giveaways.remove(guildId, giveawayId);
  }
}
