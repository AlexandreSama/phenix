import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getLeaderboard,
  compareXpMultipliers,
  listXpMultipliers,
  PrismaClient,
  replaceXpMultipliers,
} from '@phenix/database';
import {
  LEADERBOARD_PAGE_SIZE,
  levelingConfigSchema,
  type LeaderboardPage,
  type LevelingConfig,
  type LevelingConfigPatch,
  type XpMultiplierEntry,
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
  xpMultiplierMaxPercent: true,
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

  /** Les bonus d'XP du serveur (rôles, salons, catégories). */
  async getXpMultipliers(guildId: string): Promise<XpMultiplierEntry[]> {
    return listXpMultipliers(this.db, guildId);
  }

  /**
   * Remplace tous les bonus d'XP, puis prévient le bot pour qu'il vide son cache. La forme
   * (50 au plus, sans doublon, 10 à 500 %) est vérifiée par le schéma ; ici, chaque rôle, salon ou catégorie
   * doit exister sur ce serveur, avec le bon genre. Seules les entrées ajoutées sont vérifiées :
   * un rôle ou un salon supprimé depuis peut rester dans la liste sans bloquer l'enregistrement.
   */
  async replaceXpMultipliers(
    guildId: string,
    multipliers: readonly XpMultiplierEntry[],
  ): Promise<XpMultiplierEntry[]> {
    const stored = await listXpMultipliers(this.db, guildId);
    await this.assertMultiplierTargets(guildId, multipliers, stored);

    await replaceXpMultipliers(this.db, guildId, multipliers);
    await this.botEvents.notify({ type: 'config.updated', guildId });
    // Même ordre que le GET
    return multipliers.toSorted(compareXpMultipliers);
  }

  private async assertMultiplierTargets(
    guildId: string,
    multipliers: readonly XpMultiplierEntry[],
    stored: readonly XpMultiplierEntry[],
  ): Promise<void> {
    const storedKeys = new Set(stored.map(({ kind, targetId }) => `${kind}:${targetId}`));
    const added = multipliers.filter(
      ({ kind, targetId }) => !storedKeys.has(`${kind}:${targetId}`),
    );
    // @everyone, le rôle que tout le monde a, porte l'identifiant du serveur. Un salon ou une
    // catégorie peut aussi l'avoir (le salon par défaut des serveurs anciens) : seul le rôle est refusé
    if (added.some(({ kind, targetId }) => kind === 'ROLE' && targetId === guildId)) {
      throw new BadRequestException('@everyone ne peut pas recevoir de bonus');
    }
    if (added.length === 0) return;

    const kinds = new Set(added.map(({ kind }) => kind));
    const [roles, text, voice, forums, categories] = await Promise.all([
      kinds.has('ROLE') ? this.guilds.roles(guildId) : [],
      kinds.has('CHANNEL') ? this.guilds.channels(guildId) : [],
      kinds.has('CHANNEL') ? this.guilds.voice(guildId) : [],
      kinds.has('CHANNEL') ? this.guilds.forums(guildId) : [],
      kinds.has('CATEGORY') ? this.guilds.categories(guildId) : [],
    ]);
    const known = {
      ROLE: new Set(roles.map(({ id }) => id)),
      CHANNEL: new Set([...text, ...voice, ...forums].map(({ id }) => id)),
      CATEGORY: new Set(categories.map(({ id }) => id)),
    };
    const unknownMessage = {
      ROLE: 'Rôle inconnu sur ce serveur',
      CHANNEL: 'Salon inconnu sur ce serveur',
      CATEGORY: 'Catégorie inconnue sur ce serveur',
    };
    const unknown = added.find(({ kind, targetId }) => !known[kind].has(targetId));
    if (unknown) {
      throw new BadRequestException(`${unknownMessage[unknown.kind]} : ${unknown.targetId}`);
    }
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
