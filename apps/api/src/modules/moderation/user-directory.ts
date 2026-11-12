import { DiscordAPIError } from '@discordjs/rest';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ResolvedUser } from '@phenix/shared';
import { CacheService } from '../../core/cache.service.js';
import { userAvatarUrl } from '../../discord/cdn.js';
import { DiscordService } from '../../discord/discord.service.js';

/** Combien de temps Discord n'est pas réinterrogé pour un même compte (minimisation, RGPD). */
const PROFILE_TTL_SECONDS = 300;
/** Un échec est gardé moins longtemps : on réessaie vite, sans réinterroger à chaque rafraîchissement. */
const FAILURE_TTL_SECONDS = 60;
/**
 * Le budget d'une page : @discordjs/rest met tous les `/users/:id` dans une seule file, traitée l'un
 * après l'autre. Au-delà, l'identifiant s'affiche et le rafraîchissement suivant complète les noms.
 */
const MAX_LOOKUPS = 10;
const CONCURRENCY = 4;
const DEADLINE_MS = 2000;
/** Les statuts qui comptent contre le jeton du bot : on les signale, sans identifiant. */
const ALERTING_STATUSES = new Set([401, 403, 429]);

/** Ce que l'annuaire lit d'un compte Discord. */
interface DiscordProfiles {
  getUser(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ username: string; global_name?: string | null; avatar: string | null }>;
}

const fallback = (id: string): ResolvedUser => ({ id, name: id, avatarUrl: null });
const key = (id: string) => `discord:users:${id}`;

/**
 * Les noms et avatars des personnes d'une page de sanctions. La base ne garde que leur identifiant :
 * on les demande à Discord à l'affichage et on ne les conserve que quelques minutes dans Valkey.
 * Quoi qu'il arrive (Discord ou Valkey en panne, trop d'inconnus), la page reste servie, avec
 * l'identifiant à la place du nom.
 */
@Injectable()
export class UserDirectory {
  private readonly logger = new Logger(UserDirectory.name);
  /** Les appels en cours : le même compte demandé en même temps ne part qu'une fois. */
  private readonly inflight = new Map<string, Promise<ResolvedUser>>();

  constructor(
    private readonly cache: CacheService,
    @Inject(DiscordService) private readonly discord: DiscordProfiles,
  ) {}

  /** Un profil par identifiant distinct ; repli sur l'identifiant brut. */
  async resolve(
    ids: readonly string[],
    { deadlineMs = DEADLINE_MS }: { deadlineMs?: number } = {},
  ): Promise<Map<string, ResolvedUser>> {
    const distinct = [...new Set(ids)];
    const users = new Map<string, ResolvedUser>(distinct.map((id) => [id, fallback(id)]));

    let cached: (ResolvedUser | null)[];
    try {
      cached = await this.cache.getMany<ResolvedUser>(distinct.map(key));
    } catch {
      // Valkey en panne : on n'envoie pas toute la page à Discord à sa place
      this.logger.warn('Profile cache unavailable, showing identifiers');
      return users;
    }
    const missing: string[] = [];
    distinct.forEach((id, index) => {
      const hit = cached[index];
      if (hit) users.set(id, hit);
      else missing.push(id);
    });

    const queue = missing.slice(0, MAX_LOOKUPS);
    const signal = AbortSignal.timeout(deadlineMs);
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        users.set(id, await this.lookup(id, signal));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    return users;
  }

  private lookup(id: string, signal: AbortSignal): Promise<ResolvedUser> {
    const running = this.inflight.get(id);
    if (running) return running;
    const lookup = this.fetch(id, signal).finally(() => this.inflight.delete(id));
    this.inflight.set(id, lookup);
    return lookup;
  }

  private async fetch(id: string, signal: AbortSignal): Promise<ResolvedUser> {
    // Échéance déjà dépassée : inutile d'envoyer l'appel, on ne retient rien
    if (signal.aborted) return fallback(id);
    try {
      const user = await this.discord.getUser(id, signal);
      const profile: ResolvedUser = {
        id,
        name: user.global_name ?? user.username,
        avatarUrl: userAvatarUrl(id, user.avatar),
      };
      await this.keep(id, profile, PROFILE_TTL_SECONDS);
      return profile;
    } catch (err) {
      // Ni l'erreur ni l'identifiant ne sont journalisés : l'URL de l'erreur contient l'ID
      const status = err instanceof DiscordAPIError ? err.status : undefined;
      if (status !== undefined && ALERTING_STATUSES.has(status)) {
        this.logger.warn({ status }, 'Discord refused a user lookup');
      }
      await this.keep(id, fallback(id), FAILURE_TTL_SECONDS);
      return fallback(id);
    }
  }

  /** Une panne de Valkey ne doit pas faire échouer la page. */
  private async keep(id: string, profile: ResolvedUser, seconds: number): Promise<void> {
    try {
      await this.cache.put(key(id), profile, seconds);
    } catch {
      // le profil reste affiché, il sera simplement redemandé
    }
  }
}
