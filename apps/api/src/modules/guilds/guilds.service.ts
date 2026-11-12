import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { listDelegationsOf, PrismaClient } from '@phenix/database';
import {
  DASHBOARD_MODULES,
  hasForbiddenPermissions,
  type GuildCategorySummary,
  type GuildChannelSummary,
  type GuildRoleSummary,
  type ManageableGuild,
} from '@phenix/shared';
import { ChannelType, PermissionFlagsBits } from 'discord-api-types/v10';
import type { GuildModuleRequirement } from '../../common/guards/guild-access.guard.js';
import { CacheService } from '../../core/cache.service.js';
import { guildIconUrl } from '../../discord/cdn.js';
import { DiscordService } from '../../discord/discord.service.js';
import type { Session } from '../auth/session.service.js';
import { canManageGuild } from './permissions.js';

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

  /**
   * Les serveurs que l'utilisateur peut régler, ceux où le bot est présent en premier :
   * ceux qu'il gère (tous les onglets), et ceux où un administrateur lui a ouvert des onglets.
   */
  async listManageable(session: Session): Promise<ManageableGuild[]> {
    const memberOf = await this.userGuilds(session);
    const managed = memberOf.filter(canManageGuild);
    const managedIds = new Set(managed.map((guild) => guild.id));
    const [present, delegations] = await Promise.all([
      this.db.guild.findMany({
        where: { id: { in: [...managedIds] }, leftAt: null },
        select: { id: true },
      }),
      listDelegationsOf(this.db, session.userId),
    ]);
    const presentIds = new Set(present.map((guild) => guild.id));
    const byId = new Map(memberOf.map((guild) => [guild.id, guild]));

    const asAdmin = managed.map((guild): ManageableGuild => ({
      id: guild.id,
      name: guild.name,
      iconUrl: guildIconUrl(guild.id, guild.icon),
      botPresent: presentIds.has(guild.id),
      access: 'admin',
      modules: [...DASHBOARD_MODULES],
    }));
    // Un accès délégué ne vaut que tant qu'il est membre du serveur (et qu'il ne le gère pas déjà)
    const asDelegate = delegations.flatMap(({ guildId, modules }): ManageableGuild[] => {
      const guild = byId.get(guildId);
      if (!guild || managedIds.has(guildId)) return [];
      return [
        {
          id: guildId,
          name: guild.name,
          iconUrl: guildIconUrl(guildId, guild.icon),
          botPresent: true,
          access: 'delegate',
          modules: DASHBOARD_MODULES.filter((module) => modules.includes(module)),
        },
      ];
    });

    return [...asAdmin, ...asDelegate].toSorted(
      (a, b) => Number(b.botPresent) - Number(a.botPresent) || a.name.localeCompare(b.name, 'fr'),
    );
  }

  /**
   * Vérifie que l'utilisateur peut ouvrir cette partie du serveur, et que le bot y est.
   * Sans `module`, la route est réservée aux administrateurs du serveur.
   */
  async assertAccess(
    session: Session,
    guildId: string,
    module?: GuildModuleRequirement,
  ): Promise<ManageableGuild> {
    const guild = (await this.listManageable(session)).find((entry) => entry.id === guildId);
    if (!guild) throw new ForbiddenException("Tu n'as pas accès à ce serveur");
    if (!guild.botPresent) throw new NotFoundException("Le bot n'est pas sur ce serveur");
    if (guild.access === 'admin') return guild;
    if (!module) throw new ForbiddenException('Réservé aux administrateurs du serveur');
    if (module !== 'ANY' && !guild.modules.includes(module)) {
      throw new ForbiddenException('Cet onglet ne t’a pas été ouvert sur ce serveur');
    }
    return guild;
  }

  /**
   * L'utilisateur a-t-il cette permission Discord sur ce serveur ? Le propriétaire et les
   * administrateurs les ont toutes. C'est la permission de base du serveur, sans les règles des salons.
   */
  async hasDiscordPermission(session: Session, guildId: string, flag: bigint): Promise<boolean> {
    const guild = (await this.userGuilds(session)).find((entry) => entry.id === guildId);
    if (!guild) return false;
    if (guild.owner) return true;
    return (BigInt(guild.permissions) & (PermissionFlagsBits.Administrator | flag)) !== 0n;
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

  /** Les catégories du serveur, dans l'ordre de Discord : les tickets s'ouvrent dans l'une d'elles. */
  async categories(guildId: string): Promise<GuildCategorySummary[]> {
    return this.cache.wrap(`guild-categories:${guildId}`, CACHE_SECONDS, async () => {
      const all = (await this.discord.getGuildChannels(guildId)) as DiscordChannel[];
      return all
        .filter((channel) => channel.type === ChannelType.GuildCategory)
        .toSorted((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((category) => ({ id: category.id, name: category.name ?? category.id }));
    });
  }

  /**
   * Les rôles du serveur, du plus haut au plus bas. Chacun dit si le bot peut le distribuer :
   * Discord refuse qu'un bot donne un rôle placé au-dessus du sien, et on refuse les rôles de staff.
   */
  async roles(guildId: string): Promise<GuildRoleSummary[]> {
    return this.cache.wrap(`guild-roles:${guildId}`, CACHE_SECONDS, async () => {
      const [all, bot] = await Promise.all([
        this.discord.getGuildRoles(guildId),
        this.discord.getBotMember(guildId),
      ]);
      const botTop = Math.max(
        0,
        ...all.filter((role) => bot.roles.includes(role.id)).map((role) => role.position),
      );

      return all
        .filter((role) => role.id !== guildId && !role.managed) // ni @everyone, ni rôle de bot
        .toSorted((a, b) => b.position - a.position)
        .map((role) => {
          const blockedReason =
            role.position >= botTop
              ? 'Placé au-dessus du rôle du bot'
              : hasForbiddenPermissions(role.permissions)
                ? 'Donne des droits de modération ou d’administration'
                : null;
          return {
            id: role.id,
            name: role.name,
            color: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : null,
            assignable: blockedReason === null,
            blockedReason,
          };
        });
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
