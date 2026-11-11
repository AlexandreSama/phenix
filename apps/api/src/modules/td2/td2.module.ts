import { Module } from '@nestjs/common';
import { GuildsModule } from '../guilds/guilds.module.js';
import { Td2InvitesService } from './td2-invites.service.js';
import { Td2PublicController } from './td2-public.controller.js';
import { Td2Controller } from './td2.controller.js';
import { Td2Service } from './td2.service.js';

@Module({
  imports: [GuildsModule],
  controllers: [Td2Controller, Td2PublicController],
  providers: [Td2Service, Td2InvitesService],
})
export class Td2Module {}
