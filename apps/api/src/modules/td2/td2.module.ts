import { Module } from '@nestjs/common';
import { GuildsModule } from '../guilds/guilds.module.js';
import { Td2Controller } from './td2.controller.js';
import { Td2Service } from './td2.service.js';

@Module({
  imports: [GuildsModule],
  controllers: [Td2Controller],
  providers: [Td2Service],
})
export class Td2Module {}
