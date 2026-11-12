import { Logger } from '@nestjs/common';
import type { RequestHandler } from 'express';
import { redactUrl } from './log-redaction.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF de toutes les écritures de l'API. L'authentification est un cookie de session
 * (`SameSite=Lax`) : il ne part pas depuis un autre site, mais il part depuis un sous-domaine voisin,
 * et un formulaire HTML n'a besoin ni de requête préalable ni de CORS. Un navigateur dit d'où vient
 * la requête (`Sec-Fetch-Site`, `Origin`) et un site tiers ne peut pas le falsifier :
 * - `Sec-Fetch-Site` : seulement `same-origin` (le site lui-même) ou `none` (action de l'utilisateur) ;
 * - `Origin` : celui de `PUBLIC_URL`, rien d'autre (pas même « null »).
 * Sans aucun des deux (curl, tests), la requête passe : sans navigateur il n'y a pas de cookie à abuser.
 * Les deux en-têtes, quand ils sont présents, doivent être bons.
 */
export function csrfProtection(publicUrl: string): RequestHandler {
  const allowedOrigin = new URL(publicUrl).origin;
  const logger = new Logger('Csrf');
  return (request, response, next) => {
    if (SAFE_METHODS.has(request.method)) return next();
    const site = request.headers['sec-fetch-site'];
    const origin = request.headers.origin;
    const siteOk = site === undefined || site === 'same-origin' || site === 'none';
    const originOk = origin === undefined || origin === allowedOrigin;
    if (siteOk && originOk) return next();
    // pino-http n'est pas encore branché à ce stade : sans cette ligne, un refus ne laisserait aucune
    // trace. Ni cookie, ni adresse complète (la chaîne de requête peut porter une recherche).
    logger.warn(
      { method: request.method, path: redactUrl(request.path ?? ''), site, origin },
      'Cross-origin write refused',
    );
    response.status(403).json({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Requête refusée : origine inconnue',
    });
  };
}
