import { Inject, Injectable, Logger } from '@nestjs/common';
import { findPublicTd2Guild, PrismaClient } from '@phenix/database';
import { Redis } from 'ioredis';
import { ENV } from '../../core/tokens.js';
import { DiscordService } from '../../discord/discord.service.js';
import type { Env } from '../../env.js';

/** Une invitation vit 7 jours chez Discord (le maximum) ; on la réutilise un jour. */
const INVITE_MAX_AGE = 7 * 24 * 3600;
const INVITE_CACHE_SECONDS = 24 * 3600;
/** Après un échec (permission retirée…), on laisse Discord tranquille 5 minutes. */
const FAILURE_SECONDS = 300;

const inviteKey = (guildId: string) => `td2-invite:${guildId}`;
const failureKey = (guildId: string) => `td2-invite-failed:${guildId}`;

interface CachedInvite {
  channelId: string;
  code: string;
}

/**
 * Les invitations de la page publique des sorties. Le bot les crée dans le salon des sorties
 * (il lui faut « Créer une invitation ») ; un visiteur ne déclenche au plus qu'une création
 * par jour et par serveur.
 */
@Injectable()
export class Td2InvitesService {
  private readonly logger = new Logger(Td2InvitesService.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
    private readonly discord: DiscordService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Crée (ou reprend) l'invitation vers ce salon, et la garde. Laisse passer l'erreur de Discord. */
  async create(guildId: string, channelId: string): Promise<string> {
    const code = await this.discord.createInvite(channelId, INVITE_MAX_AGE);
    const cached: CachedInvite = { channelId, code };
    await this.redis.set(inviteKey(guildId), JSON.stringify(cached), 'EX', INVITE_CACHE_SECONDS);
    await this.redis.del(failureKey(guildId));
    return code;
  }

  /** Oublie l'invitation gardée : le salon a changé, ou le serveur ne se montre plus. */
  async forget(guildId: string): Promise<void> {
    await this.redis.del(inviteKey(guildId));
  }

  /** La page des sorties, avec un message : pas d'invitation à donner pour ce serveur. */
  get unavailableUrl(): string {
    return `${this.env.PUBLIC_URL}/sorties?invitation=indisponible`;
  }

  /**
   * L'adresse où envoyer un visiteur qui veut rejoindre ce serveur : son invitation, ou la
   * page des sorties avec un message si le serveur ne se montre plus ou si Discord refuse.
   */
  async joinUrl(guildId: string): Promise<string> {
    const unavailable = this.unavailableUrl;
    const guild = await findPublicTd2Guild(this.db, guildId);
    const channelId = guild?.config?.td2ChannelId;
    if (!channelId) return unavailable;

    const hit = await this.redis.get(inviteKey(guildId));
    const cached = hit ? (JSON.parse(hit) as CachedInvite) : null;
    if (cached?.channelId === channelId) return `https://discord.gg/${cached.code}`;
    if (await this.redis.get(failureKey(guildId))) return unavailable;

    try {
      return `https://discord.gg/${await this.create(guildId, channelId)}`;
    } catch (err) {
      this.logger.warn({ err, guildId }, 'Invitation de la page publique non créée');
      await this.redis.set(failureKey(guildId), '1', 'EX', FAILURE_SECONDS);
      return unavailable;
    }
  }
}
