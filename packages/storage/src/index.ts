import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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
  /** Preuves des signalements TD2 (phase 7.2) : des captures, jamais publiques */
  S3_EVIDENCE_BUCKET: z.string().min(1).default('evidence'),
  /** Images du forum (phase 8) : ré-encodées par l'API, publiques comme le forum */
  S3_MEDIA_BUCKET: z.string().min(1).default('media'),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;

export interface StoredObject {
  body: Uint8Array;
  contentType: string | null;
}

export interface ObjectStorage {
  put(key: string, body: string | Uint8Array, contentType: string): Promise<void>;
  /** Le contenu d'un objet texte, ou null s'il n'existe pas. */
  getText(key: string): Promise<string | null>;
  /** Les octets d'un objet et son type, ou null s'il n'existe pas. */
  getBytes(key: string): Promise<StoredObject | null>;
  /** Supprime des objets ; une clé déjà absente n'est pas une erreur. */
  delete(keys: readonly string[]): Promise<void>;
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
    async getBytes(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!object.Body) return null;
        return {
          body: await object.Body.transformToByteArray(),
          contentType: object.ContentType ?? null,
        };
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
    async delete(keys) {
      // Une requête par clé : DeleteObjects exige une somme de contrôle que tous les stockages
      // compatibles S3 ne vérifient pas de la même façon. Un signalement a 3 preuves au plus.
      for (const key of keys) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
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

/** Le stockage des preuves des signalements TD2 : le bot y écrit, l'API les sert aux propriétaires. */
export function createEvidenceStorage(env: StorageEnv): ObjectStorage {
  return createObjectStorage(env.S3_EVIDENCE_BUCKET, createS3Client(env));
}

/** Les images du forum : l'API les ré-encode, les range et les sert à tout le monde. */
export function createMediaStorage(env: StorageEnv): ObjectStorage {
  return createObjectStorage(env.S3_MEDIA_BUCKET, createS3Client(env));
}
