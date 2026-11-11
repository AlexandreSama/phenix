import type { TicketSummary } from '@phenix/shared';
import type { ReactNode } from 'react';
import { Badge } from '../../../components/ui/badge';

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const format = (iso: string) => dateTime.format(new Date(iso));

/** Ce qui s'est passé à la fermeture, en une ligne. */
export function closingLine(ticket: TicketSummary): string {
  if (!ticket.closedAt) return `Ouvert le ${format(ticket.createdAt)}`;
  if (!ticket.hasTranscript) return `Salon supprimé à la main le ${format(ticket.closedAt)}`;
  const messages = ticket.messageCount ?? 0;
  return `Fermé le ${format(ticket.closedAt)} par ${ticket.closedByName ?? 'inconnu'} · ${messages} ${
    messages > 1 ? 'messages' : 'message'
  }`;
}

/** Une ligne de la liste ; le lien vers le transcript arrive du parent, qui connaît le routeur. */
export function TicketRow({ ticket, action }: { ticket: TicketSummary; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-6">
      <span className="flex h-9 min-w-14 items-center justify-center rounded-lg bg-white/5 px-2 font-mono text-sm text-stone-300 tabular-nums">
        #{ticket.number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-semibold text-white">{ticket.ownerName}</p>
          {ticket.closedAt ? <Badge tone="muted">Fermé</Badge> : <Badge tone="gold">Ouvert</Badge>}
        </div>
        <p className="text-sm text-stone-400">{closingLine(ticket)}</p>
      </div>
      {action}
    </li>
  );
}
