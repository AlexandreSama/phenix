import type { ApiErrorBody } from '@phenix/shared';

/** Erreur renvoyée par l'API, avec son code HTTP et un message lisible. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Appelle l'API. Le cookie de session part tout seul : le site et l'API ont la même origine. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    const message = Array.isArray(body?.message) ? body.message.join(' · ') : body?.message;
    throw new ApiError(response.status, message ?? 'Erreur inattendue, réessaie.');
  }
  // 204, ou 202 « demande prise en compte » : pas de corps à lire
  const text = await response.text();
  return (text === '' ? undefined : JSON.parse(text)) as T;
}
