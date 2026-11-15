import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getLeaderboard, PrismaClient } from '@phenix/database';
import {
  LEADERBOARD_PAGE_SIZE,
  levelingConfigSchema,
  type LeaderboardPage,
  type LevelingConfig,
  type LevelingConfigPatch,
} from '@phenix/shared';
import { BotEventsService } from '../../core/bot-events.service.js';
import { CacheService } from '../../core/cache.service.js';
import { guildIconUrl } from '../../discord/cdn.js';
import { newGuildConfig } from '../guild-config/guild-config.service.js';
import { GuildsService } from '../guilds/guilds.service.js';

const LEVELING_FIELDS = {
  xpEnabled: true,
  xpMin: true,
  xpMax: true,
  xpCooldownSec: true,
  levelUpChannelId: true,
  leaderboardPublic: true,
  xpExcludedChannelIds: true,
} as const;

/** Le classement bouge à chaque message : 30 secondes de cache suffisent à absorber le trafic. */
const LEADERBOARD_CACHE_SECONDS = 30;

@Injectable()
export class LevelingService {
  constructor(
    private readonly db: PrismaClient,
    private readonly cache: CacheService,
    private readonly botEvents: BotEventsService,
    private readonly guilds: GuildsService,
  ) {}

  getConfig(guildId: string): Promise<LevelingConfig> {
    return this.db.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: newGuildConfig(guildId),
      select: LEVELING_FIELDS,
    });
  }

  async updateConfig(guildId: string, patch: LevelingConfigPatch): Promise<LevelingConfig> {
    // Le patch peut ne contenir que xpMin : la règle min ≤ max se vérifie sur la config complète
    const current = await this.getConfig(guildId);
    const merged = levelingConfigSchema.safeParse({ ...current, ...patch });
    if (!merged.success) {
      throw new BadRequestException(merged.error.issues.map((issue) => issue.message));
    }
    if (patch.levelUpChannelId) {
      const channels = await this.guilds.channels(guildId);
      if (!channels.some((channel) => channel.id === patch.levelUpChannelId)) {
        throw new BadRequestException('Salon inconnu sur ce serveur');
      }
    }
    if (patch.xpExcludedChannelIds) {
      await this.assertExcludableChannels(guildId, patch.xpExcludedChannelIds, current);
    }

    const config = await this.db.guildConfig.update({
      where: { guildId },
      data: patch,
      select: LEVELING_FIELDS,
    });
    await this.botEvents.notify({ type: 'config.updated', guildId });
    return config;
  }

  /**
   * Chaque salon exclu doit être un salon texte, vocal, forum ou média, ou une catégorie du serveur.
   * Un identifiant déjà enregistré mais disparu (salon supprimé) peut rester dans la liste :
   * seuls les identifiants ajoutés sont vérifiés, pour ne pas bloquer l'enregistrement.
   */
  private async assertExcludableChannels(
    guildId: string,
    ids: readonly string[],
    current: LevelingConfig,
  ): Promise<void> {
    const stored = new Set(current.xpExcludedChannelIds);
    const added = ids.filter((id) => !stored.has(id));
    if (added.length === 0) return;
    const [text, voice, forums, categories] = await Promise.all([
      this.guilds.channels(guildId),
      this.guilds.voice(guildId),
      this.guilds.forums(guildId),
      this.guilds.categories(guildId),
    ]);
    const known = new Set(
      [...text, ...voice, ...forums, ...categories].map((channel) => channel.id),
    );
    const unknown = added.find((id) => !known.has(id));
    if (unknown) throw new BadRequestException(`Salon inconnu sur ce serveur : ${unknown}`);
  }

  /**
   * Classement public. La visibilité est vérifiée à chaque appel, hors cache :
   * rendre le classement privé sur le site le cache aussitôt.
   */
  async leaderboard(guildId: string, page: number): Promise<LeaderboardPage> {
    const guild = await this.db.guild.findUnique({
      where: { id: guildId },
      select: {
        id: true,
        name: true,
        icon: true,
        leftAt: true,
        config: { select: { leaderboardPublic: true } },
      },
    });
    if (!guild || guild.leftAt || !guild.config?.leaderboardPublic) {
      throw new NotFoundException("Ce classement n'existe pas ou n'est pas public");
    }

    return this.cache.wrap(
      `leaderboard:${guildId}:${page}`,
      LEADERBOARD_CACHE_SECONDS,
      async () => {
        const slice = await getLeaderboard(this.db, guildId, page, LEADERBOARD_PAGE_SIZE.site);
        return {
          guild: { id: guild.id, name: guild.name, iconUrl: guildIconUrl(guild.id, guild.icon) },
          entries: slice.entries.map((entry) => ({
            rank: entry.rank,
            userId: entry.userId,
            displayName: entry.displayName ?? 'Membre parti',
            avatarUrl: entry.avatarUrl,
            level: entry.level,
            xp: entry.xp,
            messages: entry.messages,
          })),
          page: slice.page,
          pageCount: slice.pageCount,
          totalMembers: slice.total,
        };
      },
    );
  }
}
