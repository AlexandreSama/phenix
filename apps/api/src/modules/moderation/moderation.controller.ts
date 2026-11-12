import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  type PipeTransform,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  caseListQuerySchema,
  caseRevokeSchema,
  type CaseListQuery,
  type CasePage,
  type CaseRevokeInput,
  type CaseRevokeResult,
  type ManageableGuild,
  type MemberModeration,
} from '@phenix/shared';
import { CurrentGuildAccess } from '../../common/decorators/current-guild-access.decorator.js';
import { CurrentSession } from '../../common/decorators/current-session.decorator.js';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import { JsonBodyGuard } from '../../common/guards/json-body.guard.js';
import type { Session } from '../auth/session.service.js';
import { ModerationService } from './moderation.service.js';

/** Un numéro de sanction : un entier de 1 à 999 999 999 (le `Int` de la colonne), sinon 404, pas 500. */
const CaseNumber: PipeTransform<string, number> = {
  transform(value) {
    if (!/^[1-9]\d{0,8}$/.test(value)) throw new NotFoundException('Sanction introuvable');
    return Number(value);
  },
};

/** Un identifiant Discord : toute autre valeur répond 404, comme un membre inconnu. */
const SNOWFLAKE = /^\d{17,20}$/;

@Controller('guilds/:guildId/moderation')
@UseGuards(AuthGuard, GuildAccessGuard)
@GuildModule('MODERATION')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('cases')
  list(
    @Param('guildId') guildId: string,
    @Query({ schema: caseListQuerySchema }) query: CaseListQuery,
  ): Promise<CasePage> {
    return this.moderation.list(guildId, query);
  }

  /** Qui il est et où il en est ; son historique est la liste filtrée par `targetId`. */
  @Get('members/:userId')
  member(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
  ): Promise<MemberModeration> {
    if (!SNOWFLAKE.test(userId)) throw new NotFoundException('Membre introuvable');
    return this.moderation.member(guildId, userId);
  }

  /**
   * Lève une sanction (unban, unmute, retrait d'un avertissement). La cible n'est pas dans la
   * requête : elle est lue sur la sanction, trouvée par son numéro sur CE serveur.
   */
  @Post('cases/:number/revoke')
  @HttpCode(200)
  @UseGuards(JsonBodyGuard)
  revoke(
    @Param('number', CaseNumber) number: number,
    @CurrentSession() session: Session,
    @CurrentGuildAccess() guild: ManageableGuild,
    @Body({ schema: caseRevokeSchema }) input: CaseRevokeInput,
  ): Promise<CaseRevokeResult> {
    return this.moderation.revoke(guild, number, session, input);
  }
}
