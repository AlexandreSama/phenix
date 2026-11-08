import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { REST } from '@discordjs/rest';
import {
  Routes,
  type RESTGetAPICurrentUserGuildsResult,
  type RESTGetAPICurrentUserResult,
  type RESTGetAPIGuildChannelsResult,
  type RESTGetAPIGuildRolesResult,
  type RESTPostOAuth2AccessTokenResult,
  type RESTGetAPIGuildMemberResult,
} from 'discord-api-types/v10';
import { ENV } from '../core/tokens.js';
import type { Env } from '../env.js';
import { BOT_INVITE_PERMISSIONS } from '@phenix/shared';

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Tout ce que l'API demande à Discord : la connexion OAuth2 avec le token de l'utilisateur,
 * et la lecture des salons et rôles d'un serveur avec le token du bot.
 */
@Injectable()
export class DiscordService {
  private readonly rest: REST;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  }

  /** Adresse de retour après la connexion ; à déclarer dans le portail développeur. */
  get redirectUri(): string {
    return `${this.env.PUBLIC_URL}/api/auth/discord/callback`;
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.env.DISCORD_CLIENT_ID,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state,
      prompt: 'none',
    });
    return `https://discord.com/oauth2/authorize?${params}`;
  }

  inviteUrl(guildId?: string): string {
    const params = new URLSearchParams({
      client_id: this.env.DISCORD_CLIENT_ID,
      scope: 'bot applications.commands',
      permissions: BOT_INVITE_PERMISSIONS,
    });
    if (guildId) {
      params.set('guild_id', guildId);
      params.set('disable_guild_select', 'true');
    }
    return `https://discord.com/oauth2/authorize?${params}`;
  }

  /** Échange le code reçu au retour de Discord contre un token d'accès. */
  async exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number }> {
    const response = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.env.DISCORD_CLIENT_ID,
        client_secret: this.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
    });
    if (!response.ok) throw new UnauthorizedException('Code Discord invalide ou expiré');
    const token = (await response.json()) as RESTPostOAuth2AccessTokenResult;
    return { accessToken: token.access_token, expiresIn: token.expires_in };
  }

  getCurrentUser(accessToken: string): Promise<RESTGetAPICurrentUserResult> {
    return this.asUser(accessToken, Routes.user());
  }

  getCurrentUserGuilds(accessToken: string): Promise<RESTGetAPICurrentUserGuildsResult> {
    return this.asUser(accessToken, Routes.userGuilds());
  }

  async getGuildChannels(guildId: string): Promise<RESTGetAPIGuildChannelsResult> {
    return (await this.rest.get(Routes.guildChannels(guildId))) as RESTGetAPIGuildChannelsResult;
  }

  async getGuildRoles(guildId: string): Promise<RESTGetAPIGuildRolesResult> {
    return (await this.rest.get(Routes.guildRoles(guildId))) as RESTGetAPIGuildRolesResult;
  }

  /** Requête au nom de l'utilisateur connecté (token OAuth2). */
  private async asUser<T>(accessToken: string, route: string): Promise<T> {
    const response = await fetch(`${DISCORD_API}${route}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) throw new UnauthorizedException('Session Discord expirée');
    if (response.status === 429) {
      throw new ServiceUnavailableException(
        'Discord limite les requêtes, réessaie dans un instant',
      );
    }
    if (!response.ok) throw new ServiceUnavailableException('Discord ne répond pas');
    return (await response.json()) as T;
  }

  /** Le bot lui-même sur ce serveur : ses rôles disent jusqu'où il peut distribuer des rôles. */
  async getBotMember(guildId: string): Promise<RESTGetAPIGuildMemberResult> {
    return (await this.rest.get(
      Routes.guildMember(guildId, this.env.DISCORD_CLIENT_ID),
    )) as RESTGetAPIGuildMemberResult;
  }
}
