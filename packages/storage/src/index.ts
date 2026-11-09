import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

/**
 * Variables du stockage, communes au bot (qui écrit) et à l'API (qui lit).
 * Garage parle le protocole S3 : n'importe quel client S3 fonctionne.
 */
export const storageEnvSchema = z.object({
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default('garage'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_TRANSCRIPTS_BUCKET: z.string().min(1).default('transcripts'),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;

export interface ObjectStorage {
  put(key: string, body: string, contentType: string): Promise<void>;
  /** Le contenu d'un objet texte, ou null s'il n'existe pas. */
  getText(key: string): Promise<string | null>;
}

/** Un client S3 pour un bucket. `client` se remplace dans les tests. */
export function createObjectStorage(bucket: string, client: S3Client): ObjectStorage {
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async getText(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return (await object.Body?.transformToString('utf-8')) ?? null;
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
  };
}

/** Le client S3 réglé pour Garage : adresses « chemin » (http://hôte/bucket/clé), pas de sous-domaine. */
export function createS3Client(env: StorageEnv): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    // Depuis 2025, le SDK ajoute d'office des sommes de contrôle que tous les stockages
    // compatibles S3 ne gèrent pas ; on ne les envoie que quand l'opération l'exige
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
}

/** Le stockage des transcripts de tickets, tel que le bot et l'API l'utilisent. */
export function createTranscriptStorage(env: StorageEnv): ObjectStorage {
  return createObjectStorage(env.S3_TRANSCRIPTS_BUCKET, createS3Client(env));
}
