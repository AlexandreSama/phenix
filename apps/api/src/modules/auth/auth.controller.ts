import { randomBytes } from 'node:crypto';
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CurrentUser } from '@phenix/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { cookieOptions, SESSION_COOKIE, STATE_COOKIE } from '../../common/cookies.js';
import { CurrentSession } from '../../common/decorators/current-session.decorator.js';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { ENV } from '../../core/tokens.js';
import { DiscordService } from '../../discord/discord.service.js';
import type { Env } from '../../env.js';
import { AuthService } from './auth.service.js';
import { SessionService, type Session } from './session.service.js';

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

const guildQuerySchema = z.object({
  guildId: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
});

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly discord: DiscordService,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Étape 1 : envoie l'utilisateur sur Discord, avec un `state` contre la falsification. */
  @Get('auth/discord')
  login(@Res() res: Response): void {
    const state = randomBytes(16).toString('base64url');
    res.cookie(STATE_COOKIE, state, cookieOptions(this.env, 10 * 60_000));
    res.redirect(this.discord.authorizeUrl(state));
  }

  /** Étape 2 : Discord renvoie ici avec un code, qu'on échange contre une session. */
  @Get('auth/discord/callback')
  async callback(
    @Query({ schema: callbackQuerySchema }) query: z.infer<typeof callbackQuerySchema>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const expectedState: unknown = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, cookieOptions(this.env));

    if (query.error || !query.code || !query.state || query.state !== expectedState) {
      res.redirect(`${this.env.PUBLIC_URL}/?connexion=refusee`);
      return;
    }

    const { sessionId, maxAgeMs } = await this.auth.login(query.code);
    res.cookie(SESSION_COOKIE, sessionId, cookieOptions(this.env, maxAgeMs));
    res.redirect(`${this.env.PUBLIC_URL}/dashboard`);
  }

  @Get('auth/me')
  @UseGuards(AuthGuard)
  async me(@CurrentSession() session: Session): Promise<CurrentUser> {
    const user = await this.auth.currentUser(session.userId);
    if (!user) throw new UnauthorizedException('Connexion requise');
    return user;
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const sessionId: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof sessionId === 'string') await this.sessions.destroy(sessionId);
    res.clearCookie(SESSION_COOKIE, cookieOptions(this.env));
  }

  /** Lien d'invitation du bot, éventuellement pour un serveur précis. Public. */
  @Get('invite')
  invite(
    @Query({ schema: guildQuerySchema }) query: z.infer<typeof guildQuerySchema>,
    @Res() res: Response,
  ): void {
    res.redirect(this.discord.inviteUrl(query.guildId));
  }
}
