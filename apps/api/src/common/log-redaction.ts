/**
 * Ce qui ne doit jamais entrer dans les logs : le texte d'une recherche, les identifiants et
 * les dates d'un filtre (chaîne de requête), et l'identifiant du membre dans la fiche de modération.
 */
export function redactUrl(url: string): string {
  const path = url.split('?')[0] ?? url;
  return path.replace(/(\/moderation\/members\/)[^/]+/i, '$1:userId');
}

interface LoggedRequest {
  url?: string;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
  [key: string]: unknown;
}

/**
 * Le sérialiseur de requête de pino-http, sans la chaîne de requête, les paramètres ni l'en-tête
 * Referer : un appel du site y envoie l'adresse complète de la page, recherche comprise.
 */
export function redactRequest<T extends LoggedRequest>(req: T): T {
  const { query: _query, params: _params, headers, ...rest } = req;
  const { referer: _referer, ...kept } = (headers ?? {}) as Record<string, unknown>;
  return {
    ...rest,
    ...(headers !== undefined && { headers: kept }),
    ...(req.url !== undefined && { url: redactUrl(req.url) }),
  } as T;
}
