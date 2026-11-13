import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

const respond = (status: number, body: string) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body || null, { status }));

const sentContentType = (spy: ReturnType<typeof respond>) => {
  const init = spy.mock.calls[0]![1] as RequestInit;
  return new Headers(init.headers).get('Content-Type');
};

afterEach(() => vi.restoreAllMocks());

describe('api', () => {
  it('lit la réponse JSON', async () => {
    respond(200, '{"ok":true}');
    await expect(api('/x')).resolves.toEqual({ ok: true });
  });

  it('accepte une réponse sans corps : 202 (demande prise en compte) ou 204', async () => {
    respond(202, '');
    await expect(api('/x', { method: 'POST' })).resolves.toBeUndefined();
    respond(204, '');
    await expect(api('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  // Le serveur refuse en 415 toute écriture sans Content-Type application/json (sauf multipart)
  describe.each(['POST', 'PUT', 'PATCH', 'DELETE'])('écriture %s', (method) => {
    it('envoie Content-Type: application/json sans corps', async () => {
      const spy = respond(204, '');
      await api('/x', { method });
      expect(sentContentType(spy)).toBe('application/json');
    });

    it('envoie Content-Type: application/json avec un corps', async () => {
      const spy = respond(204, '');
      await api('/x', { method, body: JSON.stringify({ a: 1 }) });
      expect(sentContentType(spy)).toBe('application/json');
    });

    it('ne pose pas de Content-Type pour un FormData (le navigateur met la frontière)', async () => {
      const spy = respond(204, '');
      await api('/x', { method, body: new FormData() });
      expect(sentContentType(spy)).toBeNull();
    });
  });

  it('rassemble les messages d’erreur de l’API', async () => {
    respond(400, '{"message":["Salon inconnu","Rôle inconnu"],"statusCode":400}');
    const error = await api('/x').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'Salon inconnu · Rôle inconnu' });
  });
});
