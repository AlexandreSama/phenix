import { describe, expect, it, vi } from 'vitest';
import { createNekosBestProvider, NEKOS_USER_AGENT } from './gifs.js';

describe('createNekosBestProvider', () => {
  it('renvoie l’URL du GIF et s’identifie auprès de l’API', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ results: [{ url: 'https://nekos.best/api/v2/hug/abc.gif' }] }),
      );
    const gifs = createNekosBestProvider(fetchImpl);

    await expect(gifs('hug')).resolves.toBe('https://nekos.best/api/v2/hug/abc.gif');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://nekos.best/api/v2/hug',
      expect.objectContaining({ headers: { 'User-Agent': NEKOS_USER_AGENT } }),
    );
  });

  it('renvoie null si le service répond une erreur', async () => {
    const gifs = createNekosBestProvider(
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    await expect(gifs('punch')).resolves.toBeNull();
  });

  it('renvoie null si le service est injoignable', async () => {
    const gifs = createNekosBestProvider(vi.fn().mockRejectedValue(new Error('réseau')));
    await expect(gifs('shoot')).resolves.toBeNull();
  });
});
