import { BadRequestException, Injectable } from '@nestjs/common';
import type { Td2EventSummary, Td2Settings, Td2SettingsInput } from '@phenix/shared';
import { BotEventsService } from '../../core/bot-events.service.js';
import { newGuildConfig } from '../guild-config/guild-config.service.js';
import { GuildsService } from '../guilds/guilds.service.js';
import type {PrismaClient} from "@phenix/database";
import {listUpcomingTd2Events} from "@phenix/database";

const SETTINGS_SELECT = {
  td2ChannelId: true,
  td2ReportChannelId: true,
  td2ReportViewerRoleIds: true,
  td2ReportFeedChannelId: true,
} as const;

type SettingsRow = {
  td2ChannelId: string | null;
  td2ReportChannelId: string | null;
  td2ReportViewerRoleIds: string[];
  td2ReportFeedChannelId: string | null;
};

const toSettings = (config: SettingsRow): Td2Settings => ({
  channelId: config.td2ChannelId,
  reportChannelId: config.td2ReportChannelId,
  reportViewerRoleIds: config.td2ReportViewerRoleIds,
  reportFeedChannelId: config.td2ReportFeedChannelId,
});

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
      select: SETTINGS_SELECT,
    });
    return toSettings(config);
  }

  /**
   * Enregistre les réglages TD2, puis prévient le bot : il relit sa config.
   * Chaque salon et chaque rôle doit exister sur ce serveur : on n'enregistre pas l'ID d'un autre.
   */
  async saveSettings(guildId: string, input: Td2SettingsInput): Promise<Td2Settings> {
    const channelIds = [input.channelId, input.reportChannelId, input.reportFeedChannelId].filter(
        (id): id is string => id !== null,
    );
    if (channelIds.length > 0) {
      const known = new Set((await this.guilds.channels(guildId)).map((channel) => channel.id));
      if (channelIds.some((id) => !known.has(id))) {
        throw new BadRequestException('Salon inconnu sur ce serveur');
      }
    }
    if (input.reportViewerRoleIds.length > 0) {
      const known = new Set((await this.guilds.roles(guildId)).map((role) => role.id));
      if (input.reportViewerRoleIds.some((id) => !known.has(id))) {
        throw new BadRequestException('Rôle inconnu sur ce serveur');
      }
    }

    const data = {
      td2ChannelId: input.channelId,
      td2ReportChannelId: input.reportChannelId,
      td2ReportViewerRoleIds: [...new Set(input.reportViewerRoleIds)],
      td2ReportFeedChannelId: input.reportFeedChannelId,
    };
    const config = await this.db.guildConfig.upsert({
      where: { guildId },
      update: data,
      create: { ...newGuildConfig(guildId), ...data },
      select: SETTINGS_SELECT,
    });
    await this.botEvents.notify({ type: 'config.updated', guildId });
    return toSettings(config);
  }

  /** Les sorties à venir, la plus proche d'abord, avec leur remplissage. */
  async upcoming(guildId: string): Promise<Td2EventSummary[]> {
    const events = await listUpcomingTd2Events(this.db, guildId);
    return events.map((event) => ({ ...event, scheduledAt: event.scheduledAt.toISOString() }));
  }
}
