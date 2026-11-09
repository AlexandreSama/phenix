import type { PublicationStatus } from '@phenix/shared';

/**
 * Le site écrit, le bot confirme : l'état d'un message publié par le bot (panel de rôles,
 * panel de tickets…) se lit sur deux colonnes que seul le bot remplit.
 */
export function publicationStatus(row: {
  publishedAt: Date | null;
  publishError: string | null;
}): PublicationStatus {
  if (row.publishError) return 'error';
  return row.publishedAt ? 'published' : 'pending';
}
