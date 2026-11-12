export const AVATAR_HOSTS: readonly string[] = ['cdn.discordapp.com'];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TIMEOUT_MS = 3_000;

const AVATAR_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/**
 * Chemins d'avatar du CDN de Discord, et rien d'autre (ni pièce jointe, ni emoji, ni bannière) :
 * avatar de compte, avatar de serveur, avatar par défaut. Identifiants numériques, hash
 * alphanumérique (préfixe `a_` des avatars animés), extension en minuscules.
 */
const AVATAR_PATHS: readonly RegExp[] = [
  /^\/avatars\/\d+\/(?:a_)?[A-Za-z0-9]+\.(?:png|jpe?g|webp|gif)$/,
  /^\/guilds\/\d+\/users\/\d+\/avatars\/(?:a_)?[A-Za-z0-9]+\.(?:png|jpe?g|webp|gif)$/,
  /^\/embed\/avatars\/\d+\.png$/,
];

/**
 * Renvoie l'URL normalisée si elle est en https sur un hôte autorisé, sans identifiants ni port,
 * et vise un chemin d'avatar (la query, ex. `?size=256`, est permise).
 */
export function validateAvatarUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const allowed =
    parsed.protocol === 'https:' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.port === '' &&
    AVATAR_HOSTS.includes(parsed.hostname) &&
    // pathname est déjà normalisé par URL : « .. » et « %2e%2e » y sont résolus
    AVATAR_PATHS.some((path) => path.test(parsed.pathname));
  return allowed ? parsed : null;
}

/** Lit le flux par morceaux ; abandonne dès que `max` est dépassé. Corps null ou vide → null. */
export async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  max: number,
): Promise<Buffer | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return total === 0 ? null : Buffer.concat(chunks);
}

/** Statut 2xx, type d'image autorisé et taille annoncée dans la limite. */
function isAcceptableResponse(res: Response): boolean {
  if (!res.ok) return false;
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!AVATAR_CONTENT_TYPES.has(type)) return false;
  return !(Number(res.headers.get('content-length')) > AVATAR_MAX_BYTES);
}

/** Télécharge un avatar. Ne lève jamais : renvoie null au moindre problème. */
export async function fetchAvatar(
  url: string,
  // `globalThis.fetch` est lu à l'appel (et non à l'import) pour rester substituable.
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<Buffer | null> {
  const target = validateAvatarUrl(url);
  if (!target) return null;
  const controller = new AbortController();
  // Le délai couvre aussi la lecture du corps : le minuteur n'est levé qu'à la fin.
  const timer = setTimeout(() => controller.abort(), AVATAR_TIMEOUT_MS);
  try {
    const res = await fetchImpl(target.href, { signal: controller.signal, redirect: 'error' });
    if (!isAcceptableResponse(res)) {
      await res.body?.cancel();
      return null;
    }
    return await readLimited(res.body, AVATAR_MAX_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
