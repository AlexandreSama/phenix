import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ticketListQuerySchema,
  ticketSettingsSchema,
  type TicketListQuery,
  type TicketPage,
  type TicketSettings,
  type TicketSettingsInput,
  type TicketSettingsResponse,
} from '@phenix/shared';
import type { Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { GuildAdminGuard } from '../../common/guards/guild-admin.guard.js';
import { TicketsService } from './tickets.service.js';

const TicketId = new ParseIntPipe({
  exceptionFactory: () => new NotFoundException('Ticket introuvable'),
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

@Controller('guilds/:guildId/tickets')
@UseGuards(AuthGuard, GuildAdminGuard)
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
