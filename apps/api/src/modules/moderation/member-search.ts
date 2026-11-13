import { createHash } from 'node:crypto';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  caseSearchWhere,
  distinctCasePeople,
  MAX_CASE_SEARCH_USER_IDS,
  PrismaClient,
} from '@phenix/database';
import type { CasePage, ResolvedUser } from '@phenix/shared';
import { CacheService } from '../../core/cache.service.js';
import { RateLimitService } from '../../core/rate-limit.service.js';
import { DiscordService } from '../../discord/discord.service.js';
import { profileCacheKey } from './user-directory.js';

/** Au-delà, Discord est tenu pour muet : la liste répond sans les pseudos. */
const DEADLINE_MS = 1500;
const DISCORD_LIMIT = 25;
/** Une même recherche n'est pas renvoyée à Discord pendant ce temps (identifiants seulement). */
const SEARCH_TTL_SECONDS = 60;
/** Combien de personnes sanctionnées sur le serveur sont comparées aux profils en cache. */
const CACHED_PEOPLE = 500;
const MIN_LENGTH = 2;
/**
 * Discord limite un pseudo ou un surnom à 32 caractères : un texte plus long ne peut en être un.
 * Minimisation : c'est alors un mot de la raison (« propos homophobes envers Julie »), qui ne part
 * pas chez Discord et n'est pas comparé aux profils en cache.
 */
const MAX_LENGTH = 32;

/** Ce que la recherche lit de Discord. */
interface DiscordMemberSearch {
  searchGuildMembers(
    guildId: string,
    query: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<readonly { user?: { id: string } }[]>;
}

export interface MemberSearchResult {
  /** Les membres dont le pseudo correspond, pour `listGuildCases` (`filters.userIds`) */
  userIds: string[];
  nameSearch: CasePage['nameSearch'];
}

/** Un échec de Discord, réduit à son statut : seul le statut est journalisé. */
class DiscordSearchFailure extends Error {
  constructor(readonly status: number | 'timeout' | 'network') {
    super('Discord member search failed');
  }
}

/** La clé de cache : le texte n'y figure que haché (pas de pseudo en clair dans Valkey). */
const searchKey = (guildId: string, text: string) =>
  `discord:member-search:${guildId}:${createHash('sha256').update(text.toLowerCase()).digest('hex')}`;

/**
 * La recherche par pseudo de la barre de recherche des sanctions : `members/search` de Discord
 * (pseudo, surnom) et les profils déjà en cache des personnes sanctionnées sur ce serveur.
 * Quoi qu'il arrive (Discord muet, refus, limite de débit, Valkey en panne), la liste reste servie :
 * sans les pseudos, avec `nameSearch: 'unavailable'`.
 */
@Injectable()
export class MemberSearch {
  private readonly logger = new Logger(MemberSearch.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly cache: CacheService,
    private readonly rateLimit: RateLimitService,
    @Inject(DiscordService) private readonly discord: DiscordMemberSearch,
  ) {}

  async search(
    guildId: string,
    userId: string,
    q: string | undefined,
    { deadlineMs = DEADLINE_MS }: { deadlineMs?: number } = {},
  ): Promise<MemberSearchResult> {
    const text = q?.trim() ?? '';
    // Même test que la requête : un numéro ou un identifiant n'est pas un pseudo
    const where = caseSearchWhere(text);
    if (text.length < MIN_LENGTH || text.length > MAX_LENGTH || !where || !('reason' in where)) {
      return { userIds: [], nameSearch: 'not-applicable' };
    }
    const [fromDiscord, fromProfiles] = await Promise.all([
      this.fromDiscord(guildId, userId, text, deadlineMs),
      this.fromProfiles(guildId, text),
    ]);
    const userIds = [...new Set([...(fromDiscord ?? []), ...fromProfiles])].slice(
      0,
      MAX_CASE_SEARCH_USER_IDS,
    );
    return { userIds, nameSearch: fromDiscord ? 'used' : 'unavailable' };
  }

  /** Les membres trouvés par Discord, ou en cache 60 s ; null si indisponible. */
  private async fromDiscord(
    guildId: string,
    userId: string,
    text: string,
    deadlineMs: number,
  ): Promise<string[] | null> {
    const key = searchKey(guildId, text);
    let userIds: string[];
    try {
      const [hit] = await this.cache.getMany<string[]>([key]);
      if (hit) return hit;
      // Seule une recherche qui part chez Discord est comptée
      await this.rateLimit.hit(`member-search:${userId}`, 20, 60, 'Trop de recherches.');
      await this.rateLimit.hit(`member-search:guild:${guildId}`, 60, 60, 'Trop de recherches.');
      const members = await this.ask(guildId, text, deadlineMs);
      userIds = members.flatMap((member) => (member.user ? [member.user.id] : []));
    } catch (err) {
      // Jamais le texte cherché ni un identifiant : le statut seul
      if (err instanceof DiscordSearchFailure) {
        this.logger.warn({ status: err.status }, 'Discord member search unavailable');
      } else if (!(err instanceof HttpException)) {
        this.logger.warn('Member search cache unavailable, searching without names');
      }
      return null;
    }
    // Écriture facultative : un résultat déjà obtenu (et le quota déjà payé) n'est jamais perdu à
    // cause du cache. Journal générique : ni le texte cherché, ni un identifiant.
    try {
      await this.cache.put(key, userIds, SEARCH_TTL_SECONDS);
    } catch {
      this.logger.warn('Member search result not cached');
    }
    return userIds;
  }

  /** L'appel à Discord, borné par l'échéance même si la file de @discordjs/rest ignore le signal. */
  private async ask(guildId: string, text: string, deadlineMs: number) {
    const signal = AbortSignal.timeout(deadlineMs);
    const timeout = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DiscordSearchFailure('timeout')), {
        once: true,
      });
    });
    try {
      return await Promise.race([
        this.discord.searchGuildMembers(guildId, text, DISCORD_LIMIT, signal),
        timeout,
      ]);
    } catch (err) {
      if (err instanceof DiscordSearchFailure) throw err;
      if (signal.aborted) throw new DiscordSearchFailure('timeout');
      if (err instanceof DiscordAPIError || err instanceof HTTPError) {
        throw new DiscordSearchFailure(err.status);
      }
      throw new DiscordSearchFailure('network');
    }
  }

  /**
   * Les personnes sanctionnées ici dont le nom en cache commence par le texte : aucun appel
   * Discord, un seul MGET. Un profil d'échec (nom = identifiant) ne compte pas.
   */
  private async fromProfiles(guildId: string, text: string): Promise<string[]> {
    try {
      const ids = await distinctCasePeople(this.db, guildId, CACHED_PEOPLE);
      const profiles = await this.cache.getMany<Partial<ResolvedUser>>(ids.map(profileCacheKey));
      const prefix = text.toLowerCase();
      return ids.filter((id, index) => {
        const name = profiles[index]?.name;
        return typeof name === 'string' && name !== id && name.toLowerCase().startsWith(prefix);
      });
    } catch {
      // Valkey ou la base en panne : la recherche continue sans les profils en cache. Ils ne font
      // que compléter Discord : `nameSearch` suit Discord seul et reste `used` s'il a répondu.
      // Journal générique : ni le texte cherché, ni un identifiant, ni le message de l'erreur.
      this.logger.warn('Cached member profiles unavailable, searching without them');
      return [];
    }
  }
}
