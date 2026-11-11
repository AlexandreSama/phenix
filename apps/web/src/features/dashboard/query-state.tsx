import { Icon } from '../../components/icon';
import { Button } from '../../components/ui/button';

/** Des blocs gris à la place des réglages, le temps que l'API et Discord répondent. */
export function PageSkeleton({ label, panels = 2 }: { label: string; panels?: number }) {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      {Array.from({ length: panels }, (_panel, panel) => (
        <div
          key={panel}
          aria-hidden="true"
          className="rounded-2xl border border-white/6 bg-surface"
        >
          <div className="flex items-center gap-3.5 border-b border-white/6 px-5 py-4 sm:px-6">
            <span className="size-9 rounded-lg bg-white/8 motion-safe:animate-pulse" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-4 w-40 rounded bg-white/8 motion-safe:animate-pulse" />
              <span className="h-3 w-64 max-w-full rounded bg-white/6 motion-safe:animate-pulse" />
            </span>
          </div>
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            {Array.from({ length: 2 }, (_row, row) => (
              <span key={row} className="flex flex-col gap-2">
                <span className="h-3.5 w-48 rounded bg-white/8 motion-safe:animate-pulse" />
                <span className="h-11 rounded-lg bg-white/5 motion-safe:animate-pulse" />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface FailedQuery {
  error: Error | null;
  refetch: () => unknown;
}

/** La première erreur des requêtes d'une page, et de quoi relancer seulement celles qui ont échoué. */
export function firstFailure(queries: FailedQuery[]) {
  const error = queries.find((query) => query.error)?.error ?? null;
  const retry = () => {
    for (const query of queries) if (query.error) void query.refetch();
  };
  return { error, retry };
}

/** Le chargement a échoué : le message de l'API, et un bouton pour réessayer. */
export function LoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ember/60 bg-ember/10 p-5"
    >
      <div className="flex items-start gap-3">
        <Icon name="alert" className="mt-0.5 size-5 text-[#ff8a4c]" />
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-white">Chargement impossible</p>
          <p className="text-sm text-stone-300">{error.message}</p>
        </div>
      </div>
      <Button type="button" variant="ghost" onClick={onRetry} className="min-h-11">
        <Icon name="refresh" className="size-4" />
        Réessayer
      </Button>
    </div>
  );
}
