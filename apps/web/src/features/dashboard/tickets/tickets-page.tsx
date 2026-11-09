import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { buttonClass } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { ticketSettingsQuery, ticketsQuery, type TicketStatusFilter } from '../api';
import { TicketRow } from './ticket-row';

const TABS: { status: TicketStatusFilter; label: string; empty: string }[] = [
  { status: 'open', label: 'Ouverts', empty: 'Aucun ticket ouvert. Tout est traité !' },
  { status: 'closed', label: 'Fermés', empty: 'Aucun ticket fermé pour l’instant.' },
];

/** Valeurs par défaut absentes de l'URL : /tickets reste propre. */
const ticketSearch = (status: TicketStatusFilter, page = 1) => ({
  status: status === 'open' ? undefined : status,
  page: page > 1 ? page : undefined,
});

export function TicketsPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId/tickets/' });
  const { status = 'open', page = 1 } = useSearch({ from: '/dashboard/$guildId/tickets/' });
  const settings = useQuery(ticketSettingsQuery(guildId));
  const tickets = useQuery(ticketsQuery(guildId, status, page));
  const tab = TABS.find((entry) => entry.status === status) ?? TABS[0]!;
  const data = tickets.data;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-400">
          Les demandes des membres, chacune dans son salon privé.
        </p>
        <Link
          to="/dashboard/$guildId/tickets/reglages"
          params={{ guildId }}
          className={buttonClass('ghost')}
        >
          Réglages
        </Link>
      </div>

      {settings.data?.settings === null && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-stone-300">
            Les tickets ne sont pas encore réglés : choisis la catégorie, l’équipe et le salon du
            panel.
          </p>
          <Link
            to="/dashboard/$guildId/tickets/reglages"
            params={{ guildId }}
            className={buttonClass('primary')}
          >
            Régler les tickets
          </Link>
        </Card>
      )}

      <nav aria-label="Filtrer les tickets" className="flex gap-2">
        {TABS.map((entry) => (
          <Link
            key={entry.status}
            to="/dashboard/$guildId/tickets"
            params={{ guildId }}
            // status: undefined compte : « Ouverts » n'est pas actif quand l'URL dit status=closed
            search={{ status: entry.status === 'open' ? undefined : entry.status }}
            activeOptions={{ explicitUndefined: true }}
            className="rounded-full border border-brown px-3 py-1 text-sm text-stone-400 hover:text-white"
            activeProps={{ className: 'border-flame! text-white!' }}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {tickets.error && <p role="alert">{tickets.error.message}</p>}
      {!tickets.error && !data && <p>Chargement…</p>}
      {data?.tickets.length === 0 && (
        <Card className="text-center text-stone-300">{tab.empty}</Card>
      )}
      {data && data.tickets.length > 0 && (
        <ul
          aria-label={`Tickets ${tab.label.toLowerCase()}`}
          className={`flex flex-col gap-2 transition-opacity ${tickets.isPlaceholderData ? 'opacity-60' : ''}`}
        >
          {data.tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              action={
                ticket.hasTranscript && (
                  <Link
                    to="/dashboard/$guildId/tickets/$ticketId"
                    params={{ guildId, ticketId: String(ticket.id) }}
                    className={buttonClass('ghost')}
                  >
                    Lire
                  </Link>
                )
              }
            />
          ))}
        </ul>
      )}

      {data && data.pageCount > 1 && (
        <nav aria-label="Pages des tickets" className="flex items-center justify-between gap-4">
          <Link
            to="/dashboard/$guildId/tickets"
            params={{ guildId }}
            search={ticketSearch(status, data.page - 1)}
            disabled={data.page <= 1}
            className={buttonClass('ghost', data.page <= 1 ? 'pointer-events-none opacity-40' : '')}
          >
            ← Précédente
          </Link>
          <span className="text-sm text-stone-400 tabular-nums">
            Page {data.page} / {data.pageCount}
          </span>
          <Link
            to="/dashboard/$guildId/tickets"
            params={{ guildId }}
            search={ticketSearch(status, data.page + 1)}
            disabled={data.page >= data.pageCount}
            className={buttonClass(
              'ghost',
              data.page >= data.pageCount ? 'pointer-events-none opacity-40' : '',
            )}
          >
            Suivante →
          </Link>
        </nav>
      )}
    </section>
  );
}
