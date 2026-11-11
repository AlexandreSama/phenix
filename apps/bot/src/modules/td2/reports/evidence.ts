import { randomUUID } from 'node:crypto';
import { TD2_EVIDENCE_LIMITS } from '@phenix/shared';
import type { ObjectStorage } from '@phenix/storage';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_MB = TD2_EVIDENCE_LIMITS.maxBytes / (1024 * 1024);

export const EVIDENCE_REPLIES = {
  type: (name: string) =>
    `« ${name} » n'est pas une capture d'écran : PNG, JPEG, WebP ou GIF seulement. ` +
    'Une vidéo ? Mets son lien dans les détails.',
  size: (name: string) => `« ${name} » dépasse ${MAX_MB} Mo.`,
} as const;

/** Ce qu'on lit d'une pièce jointe Discord. */
export interface EvidenceAttachment {
  name: string;
  url: string;
  size: number;
  contentType: string | null;
}

/** « image/png; charset=… » → « image/png » */
const baseType = (contentType: string | null) => contentType?.split(';')[0]?.trim() ?? '';

/**
 * Vérifie les pièces jointes avant tout téléchargement, avec ce que Discord en dit.
 * Renvoie le message à afficher, ou null si tout va bien.
 */
export function checkEvidence(attachments: readonly EvidenceAttachment[]): string | null {
  for (const attachment of attachments) {
    if (!(baseType(attachment.contentType) in EXTENSIONS)) {
      return EVIDENCE_REPLIES.type(attachment.name);
    }
    if (attachment.size > TD2_EVIDENCE_LIMITS.maxBytes) {
      return EVIDENCE_REPLIES.size(attachment.name);
    }
  }
  return null;
}

export interface StoredEvidence {
  key: string;
  /** Le nom du fichier joint au message du staff : preuve-1.png… */
  fileName: string;
  bytes: Uint8Array;
}

/**
 * Télécharge chaque pièce jointe et la range dans le bucket des preuves. Les liens de Discord
 * expirent : c'est la copie du bucket qui fait foi. Si une étape échoue, ce qui a déjà été
 * rangé est retiré, et l'erreur remonte.
 */
export async function storeEvidence(
  storage: ObjectStorage,
  guildId: string,
  attachments: readonly EvidenceAttachment[],
  fetchImpl: typeof fetch = fetch,
): Promise<StoredEvidence[]> {
  const stored: StoredEvidence[] = [];
  try {
    for (const [index, attachment] of attachments.entries()) {
      const contentType = baseType(attachment.contentType);
      const extension = EXTENSIONS[contentType] ?? 'bin';
      const response = await fetchImpl(attachment.url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        throw new Error(`Téléchargement de la preuve impossible (${response.status})`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      // La taille annoncée par Discord a été vérifiée ; on revérifie ce qui est vraiment arrivé
      if (bytes.byteLength > TD2_EVIDENCE_LIMITS.maxBytes) {
        throw new Error(EVIDENCE_REPLIES.size(attachment.name));
      }

      const key = `td2-reports/${guildId}/${randomUUID()}.${extension}`;
      await storage.put(key, bytes, contentType);
      stored.push({ key, fileName: `preuve-${index + 1}.${extension}`, bytes });
    }
    return stored;
  } catch (err) {
    await storage.delete(stored.map((entry) => entry.key)).catch(() => undefined);
    throw err;
  }
}
