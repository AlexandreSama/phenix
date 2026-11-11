import { DiscordAPIError } from '@discordjs/rest';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { listPublicTd2Events, listUpcomingTd2Events, PrismaClient } from '@phenix/database';
import type {
  PublicTd2Event,
  Td2EventSummary,
  Td2Settings,
  Td2SettingsInput,
} from '@phenix/shared';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';
import { Redis } from 'ioredis';
import { BotEventsService } from '../../core/bot-events.service.js';
import { CacheService } from '../../core/cache.service.js';
import { guildIconUrl } from '../../discord/cdn.js';
import { newGuildConfig } from '../guild-config/guild-config.service.js';
import { GuildsService } from '../guilds/guilds.service.js';
import { Td2InvitesService } from './td2-invites.service.js';

/** La page publique se recalcule au plus toutes les 30 s, quel que soit le nombre de visiteurs. */
const PUBLIC_EVENTS_KEY = 'td2-public-events';
const PUBLIC_EVENTS_SECONDS = 30;

const SETTINGS_SELECT = {
  td2ChannelId: true,
  td2PublicListing: true,
  td2ReportChannelId: true,
  td2ReportViewerRoleIds: true,
  td2ReportFeedChannelId: true,
} as const;

type SettingsRow = {
  td2ChannelId: string | null;
  td2PublicListing: boolean;
  td2ReportChannelId: string | null;
  td2ReportViewerRoleIds: string[];
  td2ReportFeedChannelId: string | null;
};

const toSettings = (config: SettingsRow): Td2Settings => ({
  channelId: config.td2ChannelId,
  publicListing: config.td2PublicListing,
  reportChannelId: config.td2ReportChannelId,
  reportViewerRoleIds: config.td2ReportViewerRoleIds,
  reportFeedChannelId: config.td2ReportFeedChannelId,
});

@Injectable()
export class Td2Service {
  private readonly logger = new Logger(Td2Service.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly botEvents: BotEventsService,
    private readonly guilds: GuildsService,
    private readonly invites: Td2InvitesService,
    private readonly cache: CacheService,
    private readonly redis: Redis,
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

    const before = await this.getSettings(guildId);
    await this.checkInvite(guildId, before, input);

    const data = {
      td2ChannelId: input.channelId,
      td2PublicListing: input.publicListing,
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
    if (before.publicListing !== input.publicListing || before.channelId !== input.channelId) {
      // La page publique montre (ou retire) ce serveur tout de suite, pas dans 30 s
      await this.redis.del(PUBLIC_EVENTS_KEY);
      if (!input.publicListing) await this.invites.forget(guildId);
    }
    return toSettings(config);
  }

  /**
   * Avant de montrer le serveur sur la page publique (ou d'en changer le salon), on crée
   * l'invitation : si le bot n'en a pas le droit, l'admin l'apprend ici, pas un visiteur.
   */
  private async checkInvite(guildId: string, before: Td2Settings, input: Td2SettingsInput) {
    const channelId = input.channelId;
    if (!input.publicListing || !channelId) return;
    if (before.publicListing && before.channelId === channelId) return;
    try {
      await this.invites.create(guildId, channelId);
    } catch (err) {
      if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.MissingPermissions) {
        throw new BadRequestException(
          'Le bot ne peut pas créer d’invitation dans ce salon : donne-lui la permission « Créer une invitation ».',
        );
      }
      this.logger.warn({ err, guildId }, 'Invitation de la page publique non créée');
      throw new ServiceUnavailableException(
        'Discord n’a pas pu créer l’invitation : réessaie dans un instant.',
      );
    }
  }

  /** Les sorties à venir, la plus proche d'abord, avec leur remplissage. */
  async upcoming(guildId: string): Promise<Td2EventSummary[]> {
    const events = await listUpcomingTd2Events(this.db, guildId);
    return events.map((event) => ({ ...event, scheduledAt: event.scheduledAt.toISOString() }));
  }

  /** Les sorties à venir des serveurs qui se montrent, pour la page publique. */
  publicEvents(): Promise<PublicTd2Event[]> {
    return this.cache.wrap(PUBLIC_EVENTS_KEY, PUBLIC_EVENTS_SECONDS, async () => {
      const events = await listPublicTd2Events(this.db);
      // Ni salon ni serveur en clair : seulement ce que la page affiche
      return events.map(({ channelId: _channelId, guild, ...event }) => ({
        ...event,
        scheduledAt: event.scheduledAt.toISOString(),
        guild: { id: guild.id, name: guild.name, iconUrl: guildIconUrl(guild.id, guild.icon) },
      }));
    });
  }
}
