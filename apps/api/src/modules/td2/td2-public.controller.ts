import { Controller, Get, Param, Res } from '@nestjs/common';
import type { PublicTd2Event } from '@phenix/shared';
import type { Response } from 'express';
import { Td2InvitesService } from './td2-invites.service.js';
import { Td2Service } from './td2.service.js';

/** La page publique des sorties : aucune connexion demandée, c'est la vitrine du réseau. */
@Controller('td2/public')
export class Td2PublicController {
  constructor(
    private readonly td2: Td2Service,
    private readonly invites: Td2InvitesService,
  ) {}

  @Get('events')
  events(): Promise<PublicTd2Event[]> {
    return this.td2.publicEvents();
  }

  /** « Rejoindre ce serveur » : un lien du site, redirigé vers l'invitation Discord du moment. */
  @Get('guilds/:guildId/join')
  async join(@Param('guildId') guildId: string, @Res() res: Response): Promise<void> {
    const valid = /^\d{17,20}$/.test(guildId);
    res.redirect(valid ? await this.invites.joinUrl(guildId) : this.invites.unavailableUrl);
  }
}
