import { PrismaClient } from '@phenix/database';
import type { CurrentUser } from '@phenix/shared';
import { DiscordService } from '../../discord/discord.service.js';
import { SessionService } from './session.service.js';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../core/tokens.js';
import type { Env } from '../../env.js';

/** Une session dure au plus 7 jours, comme le token Discord qu'elle contient. */
const MAX_SESSION_SECONDS = 7 * 24 * 3600;

/** Avatar Discord, ou l'avatar par défaut quand l'utilisateur n'en a pas choisi. */
export function avatarUrl(userId: string, avatar: string | null): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=128`;
  const index = Number((BigInt(userId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly discord: DiscordService,
    private readonly sessions: SessionService,
    private readonly db: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Termine la connexion : échange le code, enregistre l'utilisateur, ouvre une session. */
  async login(code: string): Promise<{ sessionId: string; maxAgeMs: number }> {
    const { accessToken, expiresIn } = await this.discord.exchangeCode(code);
    const user = await this.discord.getCurrentUser(accessToken);
    const username = user.global_name ?? user.username;

    await this.db.user.upsert({
      where: { id: user.id },
      update: { username, avatar: user.avatar },
      create: { id: user.id, username, avatar: user.avatar },
    });

    const ttlSeconds = Math.min(expiresIn, MAX_SESSION_SECONDS);
    const sessionId = await this.sessions.create({ userId: user.id, accessToken }, ttlSeconds);
    return { sessionId, maxAgeMs: ttlSeconds * 1000 };
  }

  async currentUser(userId: string): Promise<CurrentUser | null> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    return user
      ? {
          id: user.id,
          username: user.username,
          avatarUrl: avatarUrl(user.id, user.avatar),
          isOwner: this.env.BOT_OWNER_IDS.includes(user.id),
        }
      : null;
  }
}
