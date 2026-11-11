import { describe, expect, it, vi } from 'vitest';
import {
  createGarageAdmin,
  createGarageAdminFromEnv,
  garageAdminEnvSchema,
} from './garage-admin.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createGarageAdmin', () => {
  it('lit chaque bucket avec le jeton, et le nomme par son alias', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/v2/ListBuckets')) {
        return json([
          { id: 'b2', created: '2026-11-11T00:00:00Z', globalAliases: ['media'], localAliases: [] },
          { id: 'a1', created: '2026-11-11T00:00:00Z', globalAliases: [], localAliases: [] },
        ]);
      }
      if (url.endsWith('id=b2')) return json({ id: 'b2', bytes: 2048, objects: 3, quotas: {} });
      return json({ id: 'a1', bytes: 0, objects: 0 });
    });
    const admin = createGarageAdmin({ url: 'http://garage:3903/', token: 'secret' }, fetchImpl);

    expect(await admin.bucketStats()).toEqual([
      { name: 'a1', bytes: 0, objects: 0 },
      { name: 'media', bytes: 2048, objects: 3 },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://garage:3903/v2/GetBucketInfo?id=b2',
      expect.objectContaining({ headers: { Authorization: 'Bearer secret' } }),
    );
  });

  it('échoue clairement sur un refus ou une réponse inattendue', async () => {
    const refused = createGarageAdmin({ url: 'http://garage:3903', token: 'faux' }, async () =>
      json({ code: 'Forbidden' }, 403),
    );
    await expect(refused.bucketStats()).rejects.toThrow('HTTP 403');

    const odd = createGarageAdmin({ url: 'http://garage:3903', token: 't' }, async () =>
      json({ buckets: [] }),
    );
    await expect(odd.bucketStats()).rejects.toThrow('expected array');
  });
});

describe('createGarageAdminFromEnv', () => {
  it('ne crée le client que si l’adresse et le jeton sont donnés', () => {
    expect(createGarageAdminFromEnv(garageAdminEnvSchema.parse({}))).toBeUndefined();
    expect(
      createGarageAdminFromEnv(
        garageAdminEnvSchema.parse({
          GARAGE_ADMIN_URL: 'http://garage:3903',
          GARAGE_ADMIN_TOKEN: '',
        }),
      ),
    ).toBeUndefined();
    expect(
      createGarageAdminFromEnv(
        garageAdminEnvSchema.parse({
          GARAGE_ADMIN_URL: 'http://garage:3903',
          GARAGE_ADMIN_TOKEN: 'x',
        }),
      ),
    ).toBeDefined();
  });
});
