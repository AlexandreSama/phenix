import type { PublicationStatus } from '@phenix/shared';

const STATUS: Record<PublicationStatus, { label: string; className: string }> = {
  published: { label: 'Publié', className: 'border-gold/60 text-gold' },
  pending: { label: 'Publication…', className: 'border-stone-500 text-stone-300' },
  error: { label: 'Erreur', className: 'border-flame text-flame' },
};

/** L'état d'un message que le bot publie pour le site : panels de rôles, panel de tickets… */
export function PublicationBadge({ status }: { status: PublicationStatus }) {
  const { label, className } = STATUS[status];
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${className}`}>{label}</span>;
}
