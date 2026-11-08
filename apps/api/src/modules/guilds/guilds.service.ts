import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@phenix/database';
import type { GuildChannelSummary, GuildRoleSummary, ManageableGuild } from '@phenix/shared';
import { ChannelType } from 'discord-api-types/v10';
import { CacheService } from '../../core/cache.service.js';
import { DiscordService } from '../../discord/discord.service.js';
import type { Session } from '../auth/session.service.js';
import { canManageGuild } from './permissions.js';
import { guildIconUrl } from '../../discord/cdn.js';

/** Discord limite fortement ces appels : on garde les réponses une minute. */
const CACHE_SECONDS = 60;

/** Salons où le bot peut écrire un log ou une annonce. */
const TEXT_CHANNELS = new Set<ChannelType>([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

/** Les seuls champs lus sur un salon Discord. */
interface DiscordChannel {
  id: string;
  type: ChannelType;
  name?: string | null;
  position?: number;
  parent_id?: string | null;
}

interface UserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

@Injectable()
export class GuildsService {
  constructor(
    private readonly discord: DiscordService,
    private readonly db: PrismaClient,
    private readonly cache: CacheService,
  ) {}

  /** Les serveurs que l'utilisateur peut gérer, ceux où le bot est présent en premier. */
  async listManageable(session: Session): Promise<ManageableGuild[]> {
    const manageable = (await this.userGuilds(session)).filter(canManageGuild);
    const present = await this.db.guild.findMany({
      where: { id: { in: manageable.map((guild) => guild.id) }, leftAt: null },
      select: { id: true },
    });
    const presentIds = new Set(present.map((guild) => guild.id));

    return manageable
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        iconUrl: guildIconUrl(guild.id, guild.icon),
        botPresent: presentIds.has(guild.id),
      }))
      .toSorted(
        (a, b) => Number(b.botPresent) - Number(a.botPresent) || a.name.localeCompare(b.name, 'fr'),
      );
  }

  /** Lève une erreur si l'utilisateur ne peut pas gérer ce serveur, ou si le bot n'y est pas. */
  async assertManageable(session: Session, guildId: string): Promise<void> {
    const guild = (await this.listManageable(session)).find((entry) => entry.id === guildId);
    if (!guild) throw new ForbiddenException("Tu n'as pas le droit de gérer ce serveur");
    if (!guild.botPresent) throw new NotFoundException("Le bot n'est pas sur ce serveur");
  }

  async channels(guildId: string): Promise<GuildChannelSummary[]> {
    return this.cache.wrap(`guild-channels:${guildId}`, CACHE_SECONDS, async () => {
      const all = (await this.discord.getGuildChannels(guildId)) as DiscordChannel[];
      const categories = new Map(
        all
          .filter((channel) => channel.type === ChannelType.GuildCategory)
          .map((category) => [category.id, category.name]),
      );
      return all
        .filter((channel) => TEXT_CHANNELS.has(channel.type))
        .toSorted((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((channel) => ({
          id: channel.id,
          name: channel.name ?? channel.id,
          parentName: (channel.parent_id && categories.get(channel.parent_id)) || null,
        }));
    });
  }

  async roles(guildId: string): Promise<GuildRoleSummary[]> {
    return this.cache.wrap(`guild-roles:${guildId}`, CACHE_SECONDS, async () => {
      const all = await this.discord.getGuildRoles(guildId);
      return all
        .filter((role) => role.id !== guildId && !role.managed) // ni @everyone, ni rôle de bot
        .toSorted((a, b) => b.position - a.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : null,
        }));
    });
  }

  private userGuilds(session: Session): Promise<UserGuild[]> {
    return this.cache.wrap(`user-guilds:${session.userId}`, CACHE_SECONDS, async () => {
      const guilds = await this.discord.getCurrentUserGuilds(session.accessToken);
      return guilds.map(({ id, name, icon, owner, permissions }) => ({
        id,
        name,
        icon,
        owner,
        permissions,
      }));
    });
  }
}
