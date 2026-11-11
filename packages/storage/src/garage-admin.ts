import { z } from 'zod';

/** Une variable vide dans .env compte comme absente. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/**
 * L'API d'administration de Garage (phase 11) : le bot y lit le volume de chaque bucket.
 * Jointe seulement sur le réseau interne. Sans jeton, pas de relevé Garage.
 */
export const garageAdminEnvSchema = z.object({
  GARAGE_ADMIN_URL: optional(z.url()),
  GARAGE_ADMIN_TOKEN: optional(z.string().min(1)),
});
export type GarageAdminEnv = z.infer<typeof garageAdminEnvSchema>;

export interface BucketStats {
  /** Le premier alias global du bucket ; son ID s'il n'en a pas */
  name: string;
  bytes: number;
  objects: number;
}

export interface GarageAdmin {
  /** Le volume et le nombre d'objets de chaque bucket, rangés par nom */
  bucketStats(): Promise<BucketStats[]>;
}

const listSchema = z.array(z.object({ id: z.string(), globalAliases: z.array(z.string()) }));
const infoSchema = z.object({ bytes: z.number(), objects: z.number() });

/**
 * Le client de l'API d'administration v2 de Garage (v2.x) : GET /v2/ListBuckets, puis
 * GET /v2/GetBucketInfo par bucket. Garage tient ces totaux à jour lui-même : aucun objet
 * n'est listé ni lu pour les compter.
 */
export function createGarageAdmin(
  { url, token }: { url: string; token: string },
  fetchImpl: typeof fetch = fetch,
): GarageAdmin {
  const base = url.replace(/\/$/, '');
  const get = async (path: string): Promise<unknown> => {
    const response = await fetchImpl(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Garage ${path} : HTTP ${response.status}`);
    return response.json();
  };

  return {
    async bucketStats() {
      const buckets = listSchema.parse(await get('/v2/ListBuckets'));
      const stats = await Promise.all(
        buckets.map(async (bucket) => {
          const info = infoSchema.parse(
            await get(`/v2/GetBucketInfo?id=${encodeURIComponent(bucket.id)}`),
          );
          return { name: bucket.globalAliases[0] ?? bucket.id, ...info };
        }),
      );
      return stats.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

/** Le client si l'adresse et le jeton sont donnés, sinon undefined. */
export function createGarageAdminFromEnv(env: GarageAdminEnv): GarageAdmin | undefined {
  if (!env.GARAGE_ADMIN_URL || !env.GARAGE_ADMIN_TOKEN) return undefined;
  return createGarageAdmin({ url: env.GARAGE_ADMIN_URL, token: env.GARAGE_ADMIN_TOKEN });
}
