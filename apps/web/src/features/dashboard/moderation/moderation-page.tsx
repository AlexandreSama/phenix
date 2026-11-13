import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, type CasePage } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import type { FormEvent } from 'react';
import { Icon } from '../../../components/icon';
import { buttonClass } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, inputClass } from '../../../components/ui/field';
import { PageHeader } from '../../../components/ui/panel';
import { casesQuery } from '../api';
import { LoadError, PageSkeleton } from '../query-state';
import { CaseList } from './case-list';
import { Pager } from './pager';
import type { ModerationSearch } from './search';

/** Les hooks nomment la route index avec son « / » final, les liens sans lui. */
const ROUTE = '/dashboard/$guildId/moderation/';
const LINK = '/dashboard/$guildId/moderation';

/** Le nom de la personne d'un filtre, lu dans la page affichée (sinon son identifiant). */
function personName(data: CasePage | undefined, id: string, key: 'target' | 'moderator') {
  return data?.items.find((item) => item[key].id === id)?.[key].name ?? id;
}

export function ModerationPage() {
  const { guildId } = useParams({ from: ROUTE });
  const search = useSearch({ from: ROUTE });
  const navigate = useNavigate({ from: LINK });
  const { page = 1, ...filters } = search;
  const cases = useQuery(casesQuery(guildId, filters, page));
  const data = cases.data;
  const hasFilters = Object.values(filters).some((value) => value !== undefined);

  /** Un filtre change : on repart de la première page, et l'adresse garde tout le reste. */
  const setFilter = (patch: Partial<ModerationSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: undefined }) });

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    setFilter({ q: text || undefined });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Modération"
        description="Les sanctions prises sur ce serveur par le bot : retrouve-les, et ouvre la fiche d’un membre pour voir tout son historique."
      />

      <form
        role="search"
        aria-label="Filtrer les sanctions"
        onSubmit={onSearch}
        className="grid gap-4 rounded-2xl border border-white/8 bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="sm:col-span-2 lg:col-span-4">
          <Field
            id="moderation-q"
            label="Rechercher"
            hint="Un numéro de sanction (#12), un identifiant Discord, le début d’un pseudo (membres encore sur le serveur) ou un mot de la raison."
          >
            <input
              id="moderation-q"
              name="q"
              type="search"
              // La clé remet le champ à jour quand l'adresse change (réinitialisation, retour arrière)
              key={search.q ?? ''}
              defaultValue={search.q ?? ''}
              maxLength={100}
              className={inputClass}
            />
          </Field>
        </div>
        <Field id="moderation-type" label="Type">
          <select
            id="moderation-type"
            value={search.type ?? ''}
            onChange={(event) =>
              setFilter({ type: (event.target.value || undefined) as ModerationSearch['type'] })
            }
            className={inputClass}
          >
            <option value="">Tous les types</option>
            {Object.entries(CASE_TYPE_LABELS).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="moderation-status" label="Statut">
          <select
            id="moderation-status"
            value={search.status ?? ''}
            onChange={(event) =>
              setFilter({ status: (event.target.value || undefined) as ModerationSearch['status'] })
            }
            className={inputClass}
          >
            <option value="">Tous les statuts</option>
            {Object.entries(CASE_STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="moderation-from" label="Du">
          <input
            id="moderation-from"
            type="date"
            value={search.from ?? ''}
            max={search.to}
            onChange={(event) => setFilter({ from: event.target.value || undefined })}
            className={inputClass}
          />
        </Field>
        <Field id="moderation-to" label="Au">
          <input
            id="moderation-to"
            type="date"
            value={search.to ?? ''}
            min={search.from}
            onChange={(event) => setFilter({ to: event.target.value || undefined })}
            className={inputClass}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={buttonClass('primary')}>
            <Icon name="search" className="size-4" />
            Rechercher
          </button>
          {search.targetId && (
            <Link
              to={LINK}
              params={{ guildId }}
              search={{ ...search, targetId: undefined, page: undefined }}
              className={buttonClass('ghost')}
            >
              Cible : {personName(data, search.targetId, 'target')}
              <Icon name="close" className="size-4" />
            </Link>
          )}
          {search.moderatorId && (
            <Link
              to={LINK}
              params={{ guildId }}
              search={{ ...search, moderatorId: undefined, page: undefined }}
              className={buttonClass('ghost')}
            >
              Modérateur : {personName(data, search.moderatorId, 'moderator')}
              <Icon name="close" className="size-4" />
            </Link>
          )}
          {hasFilters && (
            <Link to={LINK} params={{ guildId }} search={{}} className={buttonClass('ghost')}>
              Réinitialiser les filtres
            </Link>
          )}
          {data && data.total > 0 && (
            <p className="ml-auto text-sm text-stone-400 tabular-nums">
              {data.total} {data.total > 1 ? 'sanctions' : 'sanction'}
            </p>
          )}
        </div>
      </form>

      {data?.nameSearch === 'unavailable' && (
        <p role="status" className="text-sm text-stone-400">
          La recherche par pseudo est indisponible pour l’instant : résultats sur le numéro,
          l’identifiant et la raison.
        </p>
      )}

      {cases.error && <LoadError error={cases.error} onRetry={() => void cases.refetch()} />}
      {!cases.error && !data && <PageSkeleton label="Chargement des sanctions…" panels={1} />}
      {data && (
        <CaseList
          guildId={guildId}
          data={data}
          stale={cases.isPlaceholderData}
          empty={
            data.total > 0 ? (
              <EmptyState icon="shield" title="Cette page n’existe plus">
                <Link
                  to={LINK}
                  params={{ guildId }}
                  search={{
                    ...search,
                    page: Math.ceil(data.total / data.pageSize),
                  }}
                  className={buttonClass('ghost')}
                >
                  Aller à la dernière page
                </Link>
              </EmptyState>
            ) : hasFilters ? (
              <EmptyState icon="shield" title="Aucune sanction ne correspond">
                Essaie d’élargir la période ou de retirer un filtre.
              </EmptyState>
            ) : (
              <EmptyState icon="shield" title="Aucune sanction pour l’instant">
                Les avertissements, sourdines, expulsions et bannissements arrivent ici dès qu’ils
                sont pris.
              </EmptyState>
            )
          }
        />
      )}
      {data && (
        <Pager
          label="Pages des sanctions"
          page={data.page}
          pageCount={Math.ceil(data.total / data.pageSize)}
          link={({ page: target, className, disabled, children }) => (
            <Link
              to={LINK}
              params={{ guildId }}
              search={{ ...search, page: target > 1 ? target : undefined }}
              disabled={disabled}
              className={className}
            >
              {children}
            </Link>
          )}
        />
      )}
    </div>
  );
}
