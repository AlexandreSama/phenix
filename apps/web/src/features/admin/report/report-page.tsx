import { TD2_REPORT_STATUS_LABELS, type Td2ReportStatusKey } from '@phenix/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Icon } from '../../../components/icon';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { inputClass } from '../../../components/ui/field';
import { PageHeader } from '../../../components/ui/panel';
import { segmentActiveClass, segmentClass, segmentedClass } from '../../dashboard/list-controls';
import { LoadError, PageSkeleton } from '../../dashboard/query-state';
import { reportsQuery, useDeleteReport } from '../api';
import { ReportItem } from './report-item';

const STATUSES = Object.keys(TD2_REPORT_STATUS_LABELS) as Td2ReportStatusKey[];

/**
 * Tous les signalements du réseau. Les filtres vivent dans l'URL : une recherche se partage
 * et survit au rechargement.
 */
export function ReportsPage() {
  const search = useSearch({ from: '/admin/signalements' });
  const navigate = useNavigate({ from: '/admin/signalements' });
  const [q, setQ] = useState(search.q ?? '');
  const reports = useInfiniteQuery(reportsQuery({ status: search.status, q: search.q }));
  const remove = useDeleteReport();
  const items = reports.data?.pages.flatMap((page) => page.reports) ?? [];
  const filtered = search.status !== undefined || search.q !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Signalements"
        description="Tous les signalements faits avec /td2 signaler, sur tous les serveurs du bot. Le staff de chaque serveur les examine ; ici, tu peux supprimer ceux qui n’ont rien à faire là."
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-surface p-4">
        {/* Les statuts défilent sur téléphone plutôt que d'élargir la page */}
        <nav
          aria-label="Filtrer par statut"
          className={`${segmentedClass} max-w-full overflow-x-auto [scrollbar-width:none]`}
        >
          {[undefined, ...STATUSES].map((status) => (
            <Link
              key={status ?? 'all'}
              to="/admin/signalements"
              search={{ ...search, status }}
              activeOptions={{ includeSearch: true, explicitUndefined: true }}
              className={`${segmentClass} shrink-0 whitespace-nowrap`}
              activeProps={{ className: segmentActiveClass }}
            >
              {status ? TD2_REPORT_STATUS_LABELS[status] : 'Tous'}
            </Link>
          ))}
        </nav>

        <form
          role="search"
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({ search: { ...search, q: q.trim() || undefined } });
          }}
        >
          <label htmlFor="report-search" className="sr-only">
            Pseudo
          </label>
          <div className="relative min-w-0 flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-stone-400"
            />
            <input
              id="report-search"
              type="search"
              className={`${inputClass} pl-10 [&::-webkit-search-cancel-button]:appearance-none`}
              value={q}
              maxLength={40}
              autoComplete="off"
              placeholder="Pseudo du joueur"
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <Button type="submit" variant="ghost" className="min-h-11">
            Rechercher
          </Button>
        </form>
      </div>

      {remove.error && (
        <p role="alert" className="text-sm text-flame">
          {remove.error.message}
        </p>
      )}
      {reports.error && <LoadError error={reports.error} onRetry={() => void reports.refetch()} />}
      {reports.isPending && <PageSkeleton label="Chargement des signalements…" panels={2} />}
      {reports.isSuccess && items.length === 0 && (
        <EmptyState
          icon="flag"
          title={filtered ? 'Aucun signalement ne correspond' : 'Aucun signalement pour l’instant'}
          action={
            filtered && (
              <Link
                to="/admin/signalements"
                search={{}}
                onClick={() => setQ('')}
                className="text-sm font-medium text-gold hover:underline"
              >
                Effacer les filtres
              </Link>
            )
          }
        >
          {filtered
            ? 'Essaie un autre statut ou une autre partie du pseudo.'
            : 'Ils arrivent ici dès qu’un membre utilise /td2 signaler sur un serveur du bot.'}
        </EmptyState>
      )}
      {items.length > 0 && (
        <ul aria-label="Signalements" className="flex flex-col gap-3">
          {items.map((report) => (
            <ReportItem key={report.id} report={report} onDelete={(id) => remove.mutateAsync(id)} />
          ))}
        </ul>
      )}
      {reports.hasNextPage && (
        <Button
          variant="ghost"
          onClick={() => void reports.fetchNextPage()}
          disabled={reports.isFetchingNextPage}
          className="self-center"
        >
          {reports.isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
        </Button>
      )}
    </div>
  );
}
