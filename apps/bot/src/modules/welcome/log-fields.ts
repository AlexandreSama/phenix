export interface ErrorFields {
  code?: number | string;
  status?: number;
  error: string;
}

/**
 * Ce qu'on journalise d'une erreur, et rien d'autre. Jamais l'erreur brute : un DiscordAPIError
 * porte l'URL de la requête (avec l'ID du membre) et son corps (avec son pseudo), et le message
 * d'une erreur de validation peut citer la valeur refusée (RGPD : minimisation).
 */
export function errorFields(err: unknown): ErrorFields {
  if (!(err instanceof Error)) return { error: 'unknown' };
  const { code, status } = err as { code?: unknown; status?: unknown };
  return {
    ...((typeof code === 'number' || typeof code === 'string') && { code }),
    ...(typeof status === 'number' && { status }),
    error: err.name,
  };
}
