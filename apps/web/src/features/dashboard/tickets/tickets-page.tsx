import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { buttonClass } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/panel';
import { ticketSettingsQuery, ticketsQuery, type TicketStatusFilter } from '../api';
import { pagerLinkClass, segmentActiveClass, segmentClass, segmentedClass } from '../list-controls';
import { LoadError, PageSkeleton } from '../query-state';
import { TicketRow } from './ticket-row';

const TABS: { status: TicketStatusFilter; label: string; empty: string; hint: string }[] = [
  {
    status: 'open',
    label: 'Ouverts',
    empty: 'Aucun ticket ouvert',
    hint: 'Tout est traité ! Les nouvelles demandes arrivent ici dès qu’un membre clique sur le panel.',
  },
  {
    status: 'closed',
    label: 'Fermés',
    empty: 'Aucun ticket fermé',
    hint: 'Les tickets fermés arrivent ici, avec leur transcript à relire.',
  },
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
  const current = settings.data?.settings;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tickets"
        description="Les demandes des membres, chacune dans son salon privé avec l’équipe."
        actions={
          <Link
            to="/dashboard/$guildId/tickets/reglages"
            params={{ guildId }}
            className={buttonClass('ghost')}
          >
            <Icon name="sliders" className="size-4" />
            Réglages
          </Link>
        }
      />

      {current === null && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold/30 bg-gold/6 p-5">
          <div className="flex items-start gap-3">
            <Icon name="ticket" className="mt-0.5 size-5 text-gold" />
            <div className="flex flex-col gap-0.5">
              <p className="font-semibold text-white">Les tickets ne sont pas encore réglés</p>
              <p className="text-sm text-stone-300">
                Choisis la catégorie, l’équipe et le salon du panel : le bot publie ensuite le
                bouton « Ouvrir un ticket ».
              </p>
            </div>
          </div>
          <Link
            to="/dashboard/$guildId/tickets/reglages"
            params={{ guildId }}
            className={buttonClass('primary')}
          >
            Régler les tickets
          </Link>
        </div>
      )}
      {current?.panelStatus === 'error' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ember/60 bg-ember/10 p-5"
        >
          <div className="flex items-start gap-3">
            <Icon name="alert" className="mt-0.5 size-5 text-[#ff8a4c]" />
            <div className="flex flex-col gap-0.5">
              <p className="font-semibold text-white">Le panel n’a pas pu être publié</p>
              <p className="text-sm text-stone-300">{current.panelError}</p>
            </div>
          </div>
          <Link
            to="/dashboard/$guildId/tickets/reglages"
            params={{ guildId }}
            className={buttonClass('ghost')}
          >
            Voir les réglages
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtrer les tickets" className={segmentedClass}>
          {TABS.map((entry) => (
            <Link
              key={entry.status}
              to="/dashboard/$guildId/tickets"
              params={{ guildId }}
              // status: undefined compte : « Ouverts » n'est pas actif quand l'URL dit status=closed
              search={{ status: entry.status === 'open' ? undefined : entry.status }}
              activeOptions={{ explicitUndefined: true }}
              className={segmentClass}
              activeProps={{ className: segmentActiveClass }}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
        {data && data.total > 0 && (
          <p className="text-sm text-stone-400 tabular-nums">
            {data.total} {data.total > 1 ? 'tickets' : 'ticket'}
          </p>
        )}
      </div>

      {tickets.error && <LoadError error={tickets.error} onRetry={() => void tickets.refetch()} />}
      {!tickets.error && !data && <PageSkeleton label="Chargement des tickets…" panels={1} />}
      {data?.tickets.length === 0 && (
        <EmptyState icon="ticket" title={tab.empty}>
          {tab.hint}
        </EmptyState>
      )}
      {data && data.tickets.length > 0 && (
        <ul
          aria-label={`Tickets ${tab.label.toLowerCase()}`}
          className={`flex flex-col divide-y divide-white/6 rounded-2xl border border-white/8 bg-surface transition-opacity ${tickets.isPlaceholderData ? 'opacity-60' : ''}`}
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
                    <Icon name="file" className="size-4" />
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
            className={pagerLinkClass(data.page <= 1)}
          >
            <Icon name="arrowLeft" className="size-4" />
            Précédente
          </Link>
          <span className="text-sm text-stone-400 tabular-nums">
            Page {data.page} / {data.pageCount}
          </span>
          <Link
            to="/dashboard/$guildId/tickets"
            params={{ guildId }}
            search={ticketSearch(status, data.page + 1)}
            disabled={data.page >= data.pageCount}
            className={pagerLinkClass(data.page >= data.pageCount)}
          >
            Suivante
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </nav>
      )}
    </div>
  );
}
