import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@smithy/util-stream';
import { mockClient } from 'aws-sdk-client-mock';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';
import { createObjectStorage, storageEnvSchema } from './index.js';

const s3 = mockClient(S3Client);
const storage = createObjectStorage('transcripts', new S3Client({ region: 'garage' }));

beforeEach(() => {
  s3.reset();
});

describe('createObjectStorage', () => {
  it('range l’objet dans le bon bucket, avec son type', async () => {
    await storage.put('42/7.html', '<p>Bonjour</p>', 'text/html; charset=utf-8');

    expect(s3.commandCalls(PutObjectCommand)[0]?.args[0].input).toEqual({
      Bucket: 'transcripts',
      Key: '42/7.html',
      Body: '<p>Bonjour</p>',
      ContentType: 'text/html; charset=utf-8',
    });
  });

  it('relit un objet texte', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: sdkStreamMixin(Readable.from([Buffer.from('<p>Salut</p>')])),
    });

    expect(await storage.getText('42/7.html')).toBe('<p>Salut</p>');
  });

  it('renvoie null pour un objet absent, sans lever d’erreur', async () => {
    s3.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'absent', $metadata: {} }));

    expect(await storage.getText('42/inconnu.html')).toBe(null);
  });
});

describe('objets binaires', () => {
  it('relit les octets d’une image et son type', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    s3.on(GetObjectCommand).resolves({
      Body: sdkStreamMixin(Readable.from([Buffer.from(png)])),
      ContentType: 'image/png',
    });

    expect(await storage.getBytes('reports/1.png')).toEqual({
      body: png,
      contentType: 'image/png',
    });
  });

  it('renvoie null pour une image absente', async () => {
    s3.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'absent', $metadata: {} }));

    expect(await storage.getBytes('reports/inconnue.png')).toBe(null);
  });

  it('supprime chaque clé, une requête par clé', async () => {
    await storage.delete(['a.png', 'b.png']);

    expect(s3.commandCalls(DeleteObjectCommand).map((call) => call.args[0].input)).toEqual([
      { Bucket: 'transcripts', Key: 'a.png' },
      { Bucket: 'transcripts', Key: 'b.png' },
    ]);
  });
});

describe('storageEnvSchema', () => {
  it('prend la région et le bucket de Garage par défaut', () => {
    const env = storageEnvSchema.parse({
      S3_ENDPOINT: 'http://localhost:3900',
      S3_ACCESS_KEY_ID: 'GK123',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(env).toMatchObject({
      S3_REGION: 'garage',
      S3_TRANSCRIPTS_BUCKET: 'transcripts',
      S3_EVIDENCE_BUCKET: 'evidence',
    });
  });
});
