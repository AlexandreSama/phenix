import type { TicketSummary } from '@phenix/shared';
import type { ReactNode } from 'react';

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
    <li className="flex items-center gap-4 rounded-lg border border-brown px-4 py-3">
      <span className="w-16 font-mono text-sm text-flame tabular-nums">#{ticket.number}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">{ticket.ownerName}</p>
        <p className="text-sm text-stone-400">{closingLine(ticket)}</p>
      </div>
      {action}
    </li>
  );
}
