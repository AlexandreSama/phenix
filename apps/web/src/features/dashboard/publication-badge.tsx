import type { PublicationStatus } from '@phenix/shared';
import { Badge, type BadgeTone } from '../../components/ui/badge';

const STATUS: Record<PublicationStatus, { label: string; tone: BadgeTone }> = {
  published: { label: 'Publié', tone: 'gold' },
  pending: { label: 'Publication…', tone: 'neutral' },
  error: { label: 'Erreur', tone: 'flame' },
};

/** L'état d'un message que le bot publie pour le site : panels de rôles, panel de tickets… */
export function PublicationBadge({ status }: { status: PublicationStatus }) {
  const { label, tone } = STATUS[status];
  return (
    <Badge tone={tone} pulse={status === 'pending'}>
      {label}
    </Badge>
  );
}
