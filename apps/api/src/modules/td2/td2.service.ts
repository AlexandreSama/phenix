import { BadRequestException, Injectable } from '@nestjs/common';
import { listUpcomingTd2Events, PrismaClient } from '@phenix/database';
import type { Td2EventSummary, Td2Settings, Td2SettingsInput } from '@phenix/shared';
import { BotEventsService } from '../../core/bot-events.service.js';
import { newGuildConfig } from '../guild-config/guild-config.service.js';
import { GuildsService } from '../guilds/guilds.service.js';

@Injectable()
export class Td2Service {
  constructor(
    private readonly db: PrismaClient,
    private readonly botEvents: BotEventsService,
    private readonly guilds: GuildsService,
  ) {}

  async getSettings(guildId: string): Promise<Td2Settings> {
    const config = await this.db.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: newGuildConfig(guildId),
      select: { td2ChannelId: true },
    });
    return { channelId: config.td2ChannelId };
  }

  /** Enregistre le salon des sorties, puis prévient le bot : il relit sa config. */
  async saveSettings(guildId: string, input: Td2SettingsInput): Promise<Td2Settings> {
    if (input.channelId) {
      const channels = await this.guilds.channels(guildId);
      if (!channels.some((channel) => channel.id === input.channelId)) {
        throw new BadRequestException('Salon inconnu sur ce serveur');
      }
    }
    const config = await this.db.guildConfig.upsert({
      where: { guildId },
      update: { td2ChannelId: input.channelId },
      create: { ...newGuildConfig(guildId), td2ChannelId: input.channelId },
      select: { td2ChannelId: true },
    });
    await this.botEvents.notify({ type: 'config.updated', guildId });
    return { channelId: config.td2ChannelId };
  }

  /** Les sorties à venir, la plus proche d'abord, avec leur remplissage. */
  async upcoming(guildId: string): Promise<Td2EventSummary[]> {
    const events = await listUpcomingTd2Events(this.db, guildId);
    return events.map((event) => ({ ...event, scheduledAt: event.scheduledAt.toISOString() }));
  }
}
