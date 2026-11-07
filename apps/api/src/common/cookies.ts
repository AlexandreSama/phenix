import type { CookieOptions } from 'express';
import type { Env } from '../env.js';

export const SESSION_COOKIE = 'sid';
export const STATE_COOKIE = 'oauth_state';

/**
 * httpOnly : le JavaScript de la page ne lit jamais le cookie.
 * sameSite lax : un autre site ne peut pas envoyer de requête PATCH avec ce cookie.
 * secure : seulement en HTTPS, donc en production.
 */
export function cookieOptions(env: Env, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.PUBLIC_URL.startsWith('https://'),
    path: '/',
    ...(maxAgeMs !== undefined && { maxAge: maxAgeMs }),
  };
}
