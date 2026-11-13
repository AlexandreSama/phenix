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
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ticketListQuerySchema,
  ticketSettingsSchema,
  ticketTypeSchema,
  type TicketListQuery,
  type TicketMemberStats,
  type TicketPage,
  type TicketSettings,
  type TicketSettingsInput,
  type TicketSettingsResponse,
  type TicketTypeDetail,
  type TicketTypeInput,
  type TicketTypeStats,
  type TicketTypeSummary,
} from '@phenix/shared';
import type { Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAccessGuard, GuildModule } from '../../common/guards/guild-access.guard.js';
import { TicketsService } from './tickets.service.js';

const TicketId = new ParseIntPipe({
  exceptionFactory: () => new NotFoundException('Ticket introuvable'),
});

/** Un ID de type illisible répond 404, comme un type qui n'existe pas. */
const TypeId = new ParseIntPipe({
  exceptionFactory: () => new NotFoundException('Type de ticket introuvable'),
});

/**
 * Le transcript est du HTML écrit par le bot à partir de messages de membres. Même échappé,
 * on le sert verrouillé : aucun script, aucune requête sortante sauf les images https,
 * origine opaque (sandbox) et affichage seulement dans une page du site.
 */
export const TRANSCRIPT_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy':
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; " +
    "frame-ancestors 'self'; sandbox allow-popups allow-popups-to-escape-sandbox",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, max-age=300',
} as const;

/**
 * Les moyennes nominatives des membres de l'équipe évaluent des personnes : pas de @GuildModule,
 * la route reste aux administrateurs du serveur (comme l'onglet Accès), un délégué de l'onglet
 * Tickets n'y entre pas. Enregistré avant TicketsController, donc avant `:ticketId/transcript`.
 */
@Controller('guilds/:guildId/tickets')
@UseGuards(AuthGuard, GuildAccessGuard)
export class TicketMemberStatsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('stats/members')
  memberStats(@Param('guildId') guildId: string): Promise<TicketMemberStats> {
    return this.tickets.memberStats(guildId);
  }
}

@Controller('guilds/:guildId/tickets')
@UseGuards(AuthGuard, GuildAccessGuard)
@GuildModule('TICKETS')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('settings')
  async settings(@Param('guildId') guildId: string): Promise<TicketSettingsResponse> {
    return { settings: await this.tickets.getSettings(guildId) };
  }

  @Put('settings')
  saveSettings(
    @Param('guildId') guildId: string,
    @Body({ schema: ticketSettingsSchema }) input: TicketSettingsInput,
  ): Promise<TicketSettings> {
    return this.tickets.saveSettings(guildId, input);
  }

  @Get('types')
  listTypes(@Param('guildId') guildId: string): Promise<TicketTypeSummary[]> {
    return this.tickets.listTypes(guildId);
  }

  @Post('types')
  createType(
    @Param('guildId') guildId: string,
    @Body({ schema: ticketTypeSchema }) input: TicketTypeInput,
  ): Promise<TicketTypeDetail> {
    return this.tickets.createType(guildId, input);
  }

  @Get('types/:typeId')
  getType(
    @Param('guildId') guildId: string,
    @Param('typeId', TypeId) typeId: number,
  ): Promise<TicketTypeDetail> {
    return this.tickets.getType(guildId, typeId);
  }

  @Put('types/:typeId')
  updateType(
    @Param('guildId') guildId: string,
    @Param('typeId', TypeId) typeId: number,
    @Body({ schema: ticketTypeSchema }) input: TicketTypeInput,
  ): Promise<TicketTypeDetail> {
    return this.tickets.updateType(guildId, typeId, input);
  }

  @Delete('types/:typeId')
  @HttpCode(204)
  removeType(
    @Param('guildId') guildId: string,
    @Param('typeId', TypeId) typeId: number,
  ): Promise<void> {
    return this.tickets.removeType(guildId, typeId);
  }

  /**
   * Moyennes par type seulement, arrondies et masquées sous le seuil, sans nombre de notes :
   * jamais la note d'un ticket. Celles par membre de l'équipe : TicketMemberStatsController.
   */
  @Get('stats')
  stats(@Param('guildId') guildId: string): Promise<TicketTypeStats> {
    return this.tickets.typeStats(guildId);
  }

  @Get()
  list(
    @Param('guildId') guildId: string,
    @Query({ schema: ticketListQuerySchema }) query: TicketListQuery,
  ): Promise<TicketPage> {
    return this.tickets.list(guildId, query);
  }

  /** passthrough : Nest envoie toujours la valeur renvoyée, on ajoute seulement les en-têtes. */
  @Get(':ticketId/transcript')
  async transcript(
    @Param('guildId') guildId: string,
    @Param('ticketId', TicketId) ticketId: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { html, fileName } = await this.tickets.transcript(guildId, ticketId);
    // Posés après la lecture : une erreur 404 garde ses en-têtes JSON habituels
    res.set(TRANSCRIPT_HEADERS);
    // « inline » : affiché dans la page ; le nom sert au bouton « Télécharger » du site
    res.set('Content-Disposition', `inline; filename="${fileName}"`);
    return html;
  }
}
