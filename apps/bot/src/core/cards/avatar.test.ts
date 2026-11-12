import { CDN as DiscordCdn } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  AVATAR_HOSTS,
  AVATAR_MAX_BYTES,
  AVATAR_TIMEOUT_MS,
  fetchAvatar,
  validateAvatarUrl,
} from './avatar.js';

const OK_URL = 'https://cdn.discordapp.com/avatars/1/abc.png?size=128';

function mockFetch(response: Response | (() => Promise<Response>)) {
  return vi.fn<typeof fetch>(async () => (typeof response === 'function' ? response() : response));
}

function imageResponse(body: Uint8Array | string = 'png', init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'image/png', ...(init.headers as Record<string, string>) },
    ...init,
  });
}

/** Flux de `total` octets en blocs, sans Content-Length. */
function streamOf(total: number, contentType = 'image/png') {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) return controller.close();
      const n = Math.min(64 * 1024, total - sent);
      sent += n;
      controller.enqueue(new Uint8Array(n).fill(1));
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': contentType } });
}

/** Réponse dont le flux espionne `cancel()` : prouve que le corps refusé est libéré. */
function spyResponse(init: { contentType?: string; headers?: Record<string, string> } = {}) {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024));
    },
    cancel,
  });
  const res = new Response(stream, {
    status: 200,
    headers: { 'content-type': init.contentType ?? 'image/png', ...init.headers },
  });
  return { res, cancel };
}

describe('constantes', () => {
  it('expose la liste blanche, la taille et le délai', () => {
    expect(AVATAR_HOSTS).toEqual(['cdn.discordapp.com']);
    expect(AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(AVATAR_TIMEOUT_MS).toBe(3_000);
  });
});

describe('fetchAvatar : URL refusées sans appel réseau', () => {
  it.each([
    ['http (non chiffré)', 'http://cdn.discordapp.com/avatars/1/abc.png'],
    ['file:', 'file:///etc/passwd'],
    ['data:', 'data:image/png;base64,AAAA'],
    ['hôte étranger', 'https://evil.com/avatars/1/abc.png'],
    ['sous-domaine piégé', 'https://cdn.discordapp.com.evil.com/avatars/1/abc.png'],
    ['domaine parent', 'https://discordapp.com/avatars/1/abc.png'],
    ['localhost', 'https://localhost/avatars/1/abc.png'],
    ['IPv4 de boucle', 'https://127.0.0.1/avatars/1/abc.png'],
    ['IPv6 de boucle', 'https://[::1]/avatars/1/abc.png'],
    ['identifiants dans l’URL', 'https://user:pass@cdn.discordapp.com/avatars/1/abc.png'],
    ['port non standard', 'https://cdn.discordapp.com:8443/avatars/1/abc.png'],
    ['URL invalide', 'pas une url'],
    ['chaîne vide', ''],
  ])('%s → null', async (_label, url) => {
    const fetchImpl = mockFetch(imageResponse());
    await expect(fetchAvatar(url, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchAvatar : validation d’URL (https && !username && !password && !port && hôte autorisé)', () => {
  it.each([
    ['nom d’utilisateur seul', 'https://user@cdn.discordapp.com/avatars/1/abc.png'],
    ['mot de passe seul', 'https://:pass@cdn.discordapp.com/avatars/1/abc.png'],
    [
      'hôte autorisé placé avant « @ » (l’hôte réel est evil.com)',
      'https://cdn.discordapp.com@evil.com/avatars/1/abc.png',
    ],
    // Décision explicite : le FQDN avec point final (« cdn.discordapp.com. ») n'est pas dans la
    // liste blanche ; on le rejette par défaut sûr plutôt que de le normaliser.
    [
      'hôte avec point final (rejet par défaut sûr)',
      'https://cdn.discordapp.com./avatars/1/abc.png',
    ],
  ])('%s → null', async (_label, url) => {
    const fetchImpl = mockFetch(imageResponse());
    await expect(fetchAvatar(url, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepte l’hôte en majuscules (le nom d’hôte est insensible à la casse)', async () => {
    const fetchImpl = mockFetch(imageResponse());
    await expect(
      fetchAvatar('https://CDN.DISCORDAPP.COM/avatars/1/abc.png', fetchImpl),
    ).resolves.toBeInstanceOf(Buffer);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

const CDN = 'https://cdn.discordapp.com';

describe('fetchAvatar : seuls les chemins d’avatar sont acceptés', () => {
  it.each([
    ['avatar de compte (png)', '/avatars/200000000000000001/abc123.png'],
    ['avatar de compte (jpg)', '/avatars/1/abc.jpg'],
    ['avatar de compte (jpeg)', '/avatars/1/abc.jpeg'],
    ['avatar de compte (webp) avec taille', '/avatars/1/abc.webp?size=256'],
    ['avatar animé (préfixe a_, gif)', '/avatars/1/a_0123456789abcdef.gif?size=256'],
    [
      'avatar de serveur',
      '/guilds/100000000000000001/users/200000000000000001/avatars/abc.webp?size=256',
    ],
    ['avatar de serveur animé', '/guilds/1/users/2/avatars/a_abc.gif'],
    ['avatar par défaut', '/embed/avatars/0.png'],
    ['avatar par défaut (n° à deux chiffres)', '/embed/avatars/12.png?size=256'],
  ])('%s → téléchargé', async (_label, path) => {
    const fetchImpl = mockFetch(imageResponse());
    await expect(fetchAvatar(`${CDN}${path}`, fetchImpl)).resolves.toBeInstanceOf(Buffer);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pièce jointe', '/attachments/1/2/capture.png'],
    ['racine seule', '/'],
    ['sans chemin', ''],
    ['remontée « .. » vers une pièce jointe', '/avatars/1/../../attachments/1/2/a.png'],
    ['remontée « %2e%2e » encodée', '/avatars/1/%2e%2e/%2e%2e/attachments/1/2/a.png'],
    ['emoji', '/emojis/1.png'],
    ['bannière', '/banners/1/abc.png'],
    ['identifiant non numérique', '/avatars/abc/def.png'],
    ['identifiant vide', '/avatars//abc.png'],
    ['hash non alphanumérique', '/avatars/1/ab-c.png'],
    ['préfixe a_ sans hash', '/avatars/1/a_.png'],
    ['sans extension', '/avatars/1/abc'],
    ['extension interdite (svg)', '/avatars/1/abc.svg'],
    // décision : extension en minuscules seulement, comme le CDN la produit (défaut sûr)
    ['extension en majuscules', '/avatars/1/abc.PNG'],
    ['double extension', '/avatars/1/abc.png.html'],
    ['segment en trop', '/avatars/1/abc.png/x'],
    ['segment en moins', '/avatars/abc.png'],
    ['octet nul encodé', '/avatars/1/abc.png%00'],
    ['avatar de serveur sans users', '/guilds/1/avatars/abc.png'],
    ['avatar par défaut en gif', '/embed/avatars/0.gif'],
    ['avatar par défaut non numérique', '/embed/avatars/x.png'],
    ['préfixe en trop', '/x/avatars/1/abc.png'],
  ])('%s → null, sans appel réseau', async (_label, path) => {
    const fetchImpl = mockFetch(imageResponse());
    await expect(fetchAvatar(`${CDN}${path}`, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// /rank demande `displayAvatarURL({ size: 256, forceStatic: true })` : un avatar animé (`a_…`)
// est alors servi en .webp (première image), jamais en .gif. URL produites par discord.js lui-même.
describe('validateAvatarUrl : URL statiques produites par discord.js (forceStatic)', () => {
  const cdn = new DiscordCdn();
  const ANIMATED = 'a_0123456789abcdef0123456789abcdef';
  const options = { size: 256, forceStatic: true } as const;
  it.each([
    ['avatar de compte animé, forcé statique', cdn.avatar('200000000000000001', ANIMATED, options)],
    [
      'avatar de serveur animé, forcé statique',
      cdn.guildMemberAvatar('100000000000000001', '200000000000000001', ANIMATED, options),
    ],
    ['avatar par défaut', cdn.defaultAvatar(3)],
  ])('%s : accepté', (_label, url) => {
    expect(url).not.toMatch(/\.gif/);
    expect(validateAvatarUrl(url)?.href).toBe(url);
  });

  it('un avatar animé forcé statique est bien un .webp', () => {
    expect(cdn.avatar('200000000000000001', ANIMATED, options)).toMatch(
      /\/a_[0-9a-f]+\.webp\?size=256$/,
    );
  });
});

describe('fetchAvatar : requête', () => {
  it('refuse les redirections (redirect error ou manual)', async () => {
    const fetchImpl = mockFetch(imageResponse());
    await fetchAvatar(OK_URL, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]![1];
    expect(['error', 'manual']).toContain(init?.redirect);
  });

  it('passe un AbortSignal à fetch', async () => {
    const fetchImpl = mockFetch(imageResponse());
    await fetchAvatar(OK_URL, fetchImpl);
    expect(fetchImpl.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('interroge bien l’URL donnée', async () => {
    const fetchImpl = mockFetch(imageResponse());
    await fetchAvatar(OK_URL, fetchImpl);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(OK_URL);
  });
});

describe('fetchAvatar : réponses', () => {
  it('renvoie le Buffer des octets reçus en cas de succès', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const out = await fetchAvatar(OK_URL, mockFetch(imageResponse(bytes)));
    expect(Buffer.isBuffer(out)).toBe(true);
    expect([...out!]).toEqual([...bytes]);
  });

  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])('accepte %s', async (type) => {
    const res = new Response('x', { status: 200, headers: { 'content-type': type } });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeInstanceOf(Buffer);
  });

  it('accepte un content-type avec paramètres', async () => {
    const res = new Response('x', {
      status: 200,
      headers: { 'content-type': 'image/png; charset=binary' },
    });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeInstanceOf(Buffer);
  });

  it('accepte un content-type en casse mixte (Image/PNG)', async () => {
    const res = new Response('x', { status: 200, headers: { 'content-type': 'Image/PNG' } });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeInstanceOf(Buffer);
  });

  it.each([
    'text/html',
    'image/svg+xml',
    'image/bmp',
    'image/avif',
    'application/octet-stream',
    '',
  ])('refuse le content-type « %s »', async (type) => {
    const headers: Record<string, string> = type ? { 'content-type': type } : {};
    const res = new Response('x', { status: 200, headers });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
  });

  it("refuse un corps vide (Response(''))", async () => {
    const res = new Response('', { status: 200, headers: { 'content-type': 'image/png' } });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
  });

  it('refuse une réponse sans corps (body null)', async () => {
    const res = new Response(null, { status: 200, headers: { 'content-type': 'image/png' } });
    expect(res.body).toBeNull();
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
  });

  it('libère le corps (cancel) quand le content-type est interdit', async () => {
    const { res, cancel } = spyResponse({ contentType: 'text/html' });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
    expect(cancel).toHaveBeenCalled();
  });

  it.each([301, 302, 307, 308])('refuse une redirection %i', async (status) => {
    const res = new Response(null, {
      status,
      headers: { location: 'https://evil.com/avatars/1/abc.png', 'content-type': 'image/png' },
    });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
  });

  it.each([400, 403, 404, 500])('refuse le statut %i', async (status) => {
    const res = new Response('x', { status, headers: { 'content-type': 'image/png' } });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
  });
});

describe('fetchAvatar : taille', () => {
  it('refuse un Content-Length supérieur au maximum', async () => {
    const res = imageResponse('x', {
      headers: { 'content-length': String(AVATAR_MAX_BYTES + 1) },
    });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
  });

  it('libère le corps (cancel) quand le Content-Length annoncé est trop grand', async () => {
    const { res, cancel } = spyResponse({
      headers: { 'content-length': String(AVATAR_MAX_BYTES + 1) },
    });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
    expect(cancel).toHaveBeenCalled();
  });

  it('accepte un Content-Length égal à AVATAR_MAX_BYTES avec un corps de cette taille', async () => {
    // Frontière : tue le mutant « >= » sur la comparaison du Content-Length.
    const res = streamOf(AVATAR_MAX_BYTES);
    res.headers.set('content-length', String(AVATAR_MAX_BYTES));
    const out = await fetchAvatar(OK_URL, mockFetch(res));
    expect(out?.length).toBe(AVATAR_MAX_BYTES);
  });

  it('refuse un corps réel trop gros sans Content-Length', async () => {
    await expect(
      fetchAvatar(OK_URL, mockFetch(streamOf(AVATAR_MAX_BYTES + 1))),
    ).resolves.toBeNull();
  });

  it('refuse un corps réel trop gros malgré un Content-Length mensonger', async () => {
    const res = streamOf(AVATAR_MAX_BYTES + 1000);
    res.headers.set('content-length', '10');
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
  });

  it('accepte exactement AVATAR_MAX_BYTES', async () => {
    const out = await fetchAvatar(OK_URL, mockFetch(streamOf(AVATAR_MAX_BYTES)));
    expect(out?.length).toBe(AVATAR_MAX_BYTES);
  });

  it('refuse AVATAR_MAX_BYTES + 1 octet', async () => {
    await expect(
      fetchAvatar(OK_URL, mockFetch(streamOf(AVATAR_MAX_BYTES + 1))),
    ).resolves.toBeNull();
  });

  it('interrompt la lecture du flux dès que la limite est dépassée', async () => {
    // Flux « infini » borné à 50 blocs : une implémentation naïve (arrayBuffer()) lit tout et
    // fait échouer le test au lieu de saturer la mémoire du worker.
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 50) return controller.close();
        controller.enqueue(new Uint8Array(512 * 1024));
      },
    });
    const res = new Response(stream, { status: 200, headers: { 'content-type': 'image/png' } });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
    expect(pulls).toBeLessThan(20);
  });
});

describe('fetchAvatar : erreurs réseau', () => {
  it('renvoie null si fetch rejette (réseau)', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    await expect(fetchAvatar(OK_URL, fetchImpl)).resolves.toBeNull();
  });

  it('renvoie null si fetch est abandonné (timeout)', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('x', 'AbortError'));
    await expect(fetchAvatar(OK_URL, fetchImpl)).resolves.toBeNull();
  });

  // Couvre la phase des EN-TÊTES (fetch ne répond jamais) ; la lecture du corps est testée plus bas.
  it('abandonne un fetch qui ne répond jamais après AVATAR_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
          }),
      );
      const promise = fetchAvatar(OK_URL, fetchImpl);
      await Promise.all([
        expect(promise).resolves.toBeNull(),
        vi.advanceTimersByTimeAsync(AVATAR_TIMEOUT_MS + 100),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  // L'implémentation doit utiliser setTimeout + AbortController (AbortSignal.timeout n'est pas
  // piloté par les timers factices) et ne PAS faire clearTimeout avant la fin de la lecture du
  // corps : le délai couvre aussi le téléchargement.
  it('abandonne une lecture de corps qui se bloque après AVATAR_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
        const signal = init!.signal!;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            signal.addEventListener('abort', () => controller.error(signal.reason));
          },
          pull: () => new Promise<void>(() => {}),
        });
        return new Response(stream, { status: 200, headers: { 'content-type': 'image/png' } });
      });
      const promise = fetchAvatar(OK_URL, fetchImpl);
      await Promise.all([
        expect(promise).resolves.toBeNull(),
        vi.advanceTimersByTimeAsync(AVATAR_TIMEOUT_MS + 100),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('nettoie son minuteur après un succès', async () => {
    vi.useFakeTimers();
    try {
      const out = await fetchAvatar(OK_URL, mockFetch(imageResponse()));
      expect(out).toBeInstanceOf(Buffer);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renvoie null si la lecture du corps échoue', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('connexion coupée'));
      },
    });
    const res = new Response(stream, { status: 200, headers: { 'content-type': 'image/png' } });
    await expect(fetchAvatar(OK_URL, mockFetch(res))).resolves.toBeNull();
  });

  it('ne lève jamais, même si fetch lève de façon synchrone', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => {
      throw new Error('boom');
    });
    await expect(fetchAvatar(OK_URL, fetchImpl)).resolves.toBeNull();
  });
});
