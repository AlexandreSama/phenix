import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  deleteGuildDelegate,
  listGuildDelegates,
  PrismaClient,
  saveGuildDelegate,
} from '@phenix/database';
import {
  DASHBOARD_MODULES,
  type DashboardModuleKey,
  type GuildDelegate,
  type GuildMemberResult,
} from '@phenix/shared';
import { CacheService } from '../../core/cache.service.js';
import { RateLimitService } from '../../core/rate-limit.service.js';
import { DiscordService } from '../../discord/discord.service.js';
import { avatarUrl } from '../auth/auth.service.js';
import type { Session } from '../auth/session.service.js';

/** Une recherche identique, tapée par un autre admin, reprend la réponse de Discord. */
const SEARCH_CACHE_SECONDS = 30;

type DelegateRow = Awaited<ReturnType<typeof listGuildDelegates>>[number];

const toDelegate = (row: DelegateRow): GuildDelegate => ({
  userId: row.userId,
  username: row.username,
  avatarUrl: avatarUrl(row.userId, row.avatar),
  // Dans l'ordre des onglets, quel que soit l'ordre des cases cochées
  modules: DASHBOARD_MODULES.filter((module) => row.modules.includes(module)),
  grantedById: row.grantedById,
  updatedAt: row.updatedAt.toISOString(),
});

/** Les accès délégués d'un serveur : à qui un administrateur ouvre quels onglets. */
@Injectable()
export class DelegatesService {
  constructor(
    private readonly db: PrismaClient,
    private readonly discord: DiscordService,
    private readonly cache: CacheService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async list(guildId: string): Promise<GuildDelegate[]> {
    return (await listGuildDelegates(this.db, guildId)).map(toDelegate);
  }

  /** Les membres dont le pseudo ou le surnom commence par `query`, sans les bots. */
  async search(session: Session, guildId: string, query: string): Promise<GuildMemberResult[]> {
    // Chaque frappe interroge Discord : on borne le rythme par compte
    await this.rateLimit.hit(
      `member-search:${session.userId}`,
      60,
      60,
      'Trop de recherches à la suite : patiente une minute.',
    );
    const key = `member-search:${guildId}:${query.toLowerCase()}`;
    return this.cache.wrap(key, SEARCH_CACHE_SECONDS, async () => {
      const members = await this.discord.searchGuildMembers(guildId, query, 10);
      return members
        .filter((member) => !member.user.bot)
        .map((member) => {
          const shown = member.nick ?? member.user.global_name ?? null;
          return {
            id: member.user.id,
            username: member.user.username,
            displayName: shown && shown !== member.user.username ? shown : null,
            avatarUrl: avatarUrl(member.user.id, member.user.avatar),
          };
        });
    });
  }

  /**
   * Ouvre des onglets à un membre, ou remplace ceux qu'il avait. Il doit être sur le serveur :
   * son pseudo et son avatar sont relus chez Discord, pas pris de la requête.
   */
  async save(
    session: Session,
    guildId: string,
    userId: string,
    modules: DashboardModuleKey[],
  ): Promise<GuildDelegate> {
    if (userId === session.userId) {
      throw new BadRequestException('Tu as déjà accès à tous les onglets de ce serveur');
    }
    const member = await this.discord.getGuildMember(guildId, userId);
    if (!member) throw new NotFoundException("Ce membre n'est pas sur le serveur");
    if (member.user.bot) throw new BadRequestException('Un bot ne reçoit pas d’accès au site');

    const saved = await saveGuildDelegate(this.db, {
      guildId,
      userId,
      username: member.user.username,
      avatar: member.user.avatar,
      modules,
      grantedById: session.userId,
    });
    return toDelegate(saved);
  }

  async remove(guildId: string, userId: string): Promise<void> {
    if (!(await deleteGuildDelegate(this.db, guildId, userId))) {
      throw new NotFoundException("Ce membre n'a pas d'accès sur ce serveur");
    }
  }
}
