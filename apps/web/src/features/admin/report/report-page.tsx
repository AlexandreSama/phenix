import { TD2_REPORT_STATUS_LABELS, type Td2ReportStatusKey } from '@phenix/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { inputClass } from '../../../components/ui/field';
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

    return (
        <div className="flex flex-col gap-4">
            <form
                role="search"
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    void navigate({ search: { ...search, q: q.trim() || undefined } });
                }}
            >
                <label className="flex flex-col gap-1 text-xs text-stone-400">
                    Statut
                    <select
                        className={inputClass}
                        value={search.status ?? ''}
                        onChange={(event) =>
                            void navigate({
                                search: {
                                    ...search,
                                    status: (event.target.value || undefined) as Td2ReportStatusKey | undefined,
                                },
                            })
                        }
                    >
                        <option value="">Tous</option>
                        {STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {TD2_REPORT_STATUS_LABELS[status]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-stone-400">
                    Pseudo
                    <input
                        className={inputClass}
                        value={q}
                        maxLength={40}
                        placeholder="Une partie du pseudo"
                        onChange={(event) => setQ(event.target.value)}
                    />
                </label>
                <Button type="submit" variant="ghost">
                    Rechercher
                </Button>
            </form>

            {reports.error && <p role="alert">{reports.error.message}</p>}
            {reports.isPending && <p>Chargement…</p>}
            {reports.isSuccess && items.length === 0 && (
                <p className="text-sm text-stone-400">Aucun signalement ne correspond.</p>
            )}
            {items.length > 0 && (
                <ul aria-label="Signalements" className="flex flex-col divide-y divide-brown">
                    {items.map((report) => (
                        <ReportItem
                            key={report.id}
                            report={report}
                            onDelete={(id) => remove.mutateAsync(id)}
                        />
                    ))}
                </ul>
            )}
            {reports.hasNextPage && (
                <Button
                    variant="ghost"
                    onClick={() => void reports.fetchNextPage()}
                    disabled={reports.isFetchingNextPage}
                    className="self-start"
                >
                    {reports.isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
                </Button>
            )}
        </div>
    );
}