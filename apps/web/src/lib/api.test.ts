import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

const respond = (status: number, body: string) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body || null, { status }));

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

  it('rassemble les messages d’erreur de l’API', async () => {
    respond(400, '{"message":["Salon inconnu","Rôle inconnu"],"statusCode":400}');
    const error = await api('/x').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'Salon inconnu · Rôle inconnu' });
  });
});
