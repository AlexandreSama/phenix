/** Catégories de GIF utilisées par les commandes d'action (API nekos.best, contenu SFW). */
export type GifCategory = 'hug' | 'punch' | 'shoot';

/** Renvoie l'URL d'un GIF, ou null si le service ne répond pas : la commande marche sans. */
export type GifProvider = (category: GifCategory) => Promise<string | null>;

/**
 * nekos.best exige un User-Agent « NomDeLApp (contact) » : un nom générique ou celui
 * de Node par défaut est bloqué. Remplace le lien par ton dépôt ou une adresse de contact.
 */
export const NEKOS_USER_AGENT = 'PhenixBot (https://github.com/AlexandreSama/phenix)';

export function createNekosBestProvider(fetchImpl: typeof fetch = fetch): GifProvider {
  return async (category) => {
    try {
      const response = await fetchImpl(`https://nekos.best/api/v2/${category}`, {
        headers: { 'User-Agent': NEKOS_USER_AGENT },
        signal: AbortSignal.timeout(2_500),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { results?: { url?: string }[] };
      return body.results?.[0]?.url ?? null;
    } catch {
      return null;
    }
  };
}
