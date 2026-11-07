import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@phenix/database';
import {
  BOT_EVENTS_CHANNEL,
  type BotEvent,
  type GeneralConfig,
  type GeneralConfigPatch,
} from '@phenix/shared';
import { Redis } from 'ioredis';
import { GuildsService } from '../guilds/guilds.service.js';

const GENERAL_FIELDS = {
  timezone: true,
  modLogChannelId: true,
  announceChannelId: true,
  staffRoleIds: true,
} as const;

@Injectable()
export class GuildConfigService {
  private readonly logger = new Logger(GuildConfigService.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
    private readonly guilds: GuildsService,
  ) {}

  /** La config générale ; créée avec les valeurs par défaut si elle n'existe pas encore. */
  get(guildId: string): Promise<GeneralConfig> {
    return this.db.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: { guildId, staffRoleIds: [], ticketStaffRoleIds: [], td2ReportViewerRoleIds: [] },
      select: GENERAL_FIELDS,
    });
  }

  async update(guildId: string, patch: GeneralConfigPatch): Promise<GeneralConfig> {
    await this.assertBelongsToGuild(guildId, patch);
    await this.get(guildId); // la ligne existe avant la mise à jour

    const config = await this.db.guildConfig.update({
      where: { guildId },
      data: patch,
      select: GENERAL_FIELDS,
    });
    await this.notifyBot({ type: 'config.updated', guildId });
    return config;
  }

  /** Le schéma vérifie la forme des IDs ; ici on vérifie qu'ils existent sur CE serveur. */
  private async assertBelongsToGuild(guildId: string, patch: GeneralConfigPatch): Promise<void> {
    const channelIds = [patch.modLogChannelId, patch.announceChannelId].filter(
      (id): id is string => typeof id === 'string',
    );
    if (channelIds.length > 0) {
      const known = new Set((await this.guilds.channels(guildId)).map((channel) => channel.id));
      if (channelIds.some((id) => !known.has(id))) {
        throw new BadRequestException('Salon inconnu sur ce serveur');
      }
    }
    if (patch.staffRoleIds && patch.staffRoleIds.length > 0) {
      const known = new Set((await this.guilds.roles(guildId)).map((role) => role.id));
      if (patch.staffRoleIds.some((id) => !known.has(id))) {
        throw new BadRequestException('Rôle inconnu sur ce serveur');
      }
    }
  }

  /** Prévient le bot. Un échec n'annule pas l'enregistrement : le bot relit sa config sous 5 minutes. */
  private async notifyBot(event: BotEvent): Promise<void> {
    try {
      await this.redis.publish(BOT_EVENTS_CHANNEL, JSON.stringify(event));
    } catch (err) {
      this.logger.warn({ err, event }, 'Événement non publié sur Valkey');
    }
  }
}
