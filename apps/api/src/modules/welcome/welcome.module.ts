import { Module } from '@nestjs/common';
import { GuildsModule } from '../guilds/guilds.module.js';
import { WelcomeController } from './welcome.controller.js';
import { WelcomeService } from './welcome.service.js';

@Module({
  imports: [GuildsModule],
  controllers: [WelcomeController],
  providers: [WelcomeService],
})
export class WelcomeModule {}
