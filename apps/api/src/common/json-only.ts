import { Logger } from '@nestjs/common';
import type { Request, RequestHandler } from 'express';
import { redactUrl } from './log-redaction.js';

export const JSON_ONLY_MESSAGE = 'Cette action n’accepte que du JSON';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Les seules écritures qui ne sont pas du JSON : l'envoi d'une image du forum (méthode, chemin). */
const MULTIPART_ROUTES = new Set(['POST /api/forum/images']);

/** Le type de contenu sans ses paramètres (`; charset=…`), en minuscules ; `undefined` s'il manque. */
function mediaType(request: Pick<Request, 'headers'>): string | undefined {
  const header = request.headers['content-type'];
  return header?.split(';')[0]?.trim().toLowerCase();
}

/** Vrai pour `application/json`, avec ou sans paramètre ; pas pour les variantes `…+json`. */
export function isJsonRequest(request: Pick<Request, 'headers'>): boolean {
  return mediaType(request) === 'application/json';
}

/** Un corps annoncé : `Transfer-Encoding`, ou `Content-Length` supérieur à 0. */
export function hasBody(request: Pick<Request, 'headers'>): boolean {
  const length = request.headers['content-length'];
  return request.headers['transfer-encoding'] !== undefined || Number(length ?? 0) !== 0;
}

/**
 * Le chemin sans ses « / » finaux, en temps linéaire : l'expression `/\/+$/` est quadratique sur des
 * milliers de « / » suivis d'un autre caractère (ReDoS, avant toute authentification).
 */
function withoutTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path[end - 1] === '/') end -= 1;
  return path.slice(0, end);
}

/** Express route sans distinguer la casse ni la barre finale : la liste blanche non plus. */
function isMultipartRoute(request: Request): boolean {
  const path = withoutTrailingSlashes((request.path ?? '').toLowerCase());
  return (
    mediaType(request) === 'multipart/form-data' &&
    MULTIPART_ROUTES.has(`${request.method} ${path}`)
  );
}

/**
 * Toutes les écritures de l'API n'acceptent que du JSON. Un formulaire HTML (urlencoded, texte,
 * multipart) part sans requête préalable ni contrôle CORS : c'est le résidu de la protection CSRF
 * (ADR-0004), un vieux navigateur qui n'envoie ni `Sec-Fetch-Site` ni `Origin`. Une écriture sans
 * corps ni `Content-Type` passe (déconnexion, curl) ; seul l'envoi d'images du forum est en multipart.
 */
export function jsonOnly(): RequestHandler {
  const logger = new Logger('JsonOnly');
  return (request, response, next) => {
    if (SAFE_METHODS.has(request.method)) return next();
    const type = mediaType(request);
    if (type === undefined ? !hasBody(request) : isJsonRequest(request)) return next();
    if (isMultipartRoute(request)) return next();
    // Comme pour le CSRF : ni cookie, ni corps, ni adresse complète ; le type seul, sans paramètre
    logger.warn(
      {
        method: request.method,
        path: redactUrl(request.path ?? ''),
        contentType: type?.slice(0, 100),
      },
      'Non-JSON write refused',
    );
    response.status(415).json({
      statusCode: 415,
      error: 'Unsupported Media Type',
      message: JSON_ONLY_MESSAGE,
    });
  };
}
