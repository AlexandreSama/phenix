import type { PublicTd2Event, Td2EventKindKey } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Icon } from '../../components/icon';
import { buttonClass } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Switch } from '../../components/ui/switch';
import { LoadError, PageSkeleton } from '../dashboard/query-state';
import { segmentActiveClass, segmentClass, segmentedClass } from '../dashboard/list-controls';
import { publicEventsQuery } from './api';
import { groupByDay } from './group-by-day';
import { PublicEventCard } from './public-event-card';

/** Le filtre de type dans l'URL (« ?type=mission »), et le type de sortie qu'il garde. */
export type SortieType = 'raid' | 'incursion' | 'mission';

const TYPES: { type: SortieType | undefined; kind?: Td2EventKindKey; label: string }[] = [
  { type: undefined, label: 'Toutes' },
  { type: 'raid', kind: 'RAID', label: 'Raids' },
  { type: 'incursion', kind: 'INCURSION', label: 'Incursions' },
  { type: 'mission', kind: 'MISSION', label: 'Missions' },
];

const kindOf = (type: SortieType | undefined) => TYPES.find((entry) => entry.type === type)?.kind;

const hasRoom = (event: PublicTd2Event) => event.confirmed < event.capacity;

interface Props {
  /** L'heure et le fuseau de référence ; ceux du navigateur par défaut (les tests les fixent) */
  now?: Date;
  timeZone?: string;
}

/**
 * Toutes les sorties à venir des serveurs du réseau qui ont choisi de se montrer.
 * Une place tente le visiteur : il rejoint le serveur, puis s'inscrit sous l'annonce.
 */
export function SortiesPage({ now, timeZone }: Props = {}) {
  const { type, places, invitation } = useSearch({ from: '/sorties' });
  const navigate = useNavigate({ from: '/sorties' });
  const { data, error, refetch } = useQuery(publicEventsQuery);

  useEffect(() => {
    document.title = 'Sorties en cours · PhenixMG';
  }, []);

  const kind = kindOf(type);
  const shown = (data ?? []).filter(
    (event) => (!kind || event.kind === kind) && (places !== 'libres' || hasRoom(event)),
  );
  const groups = groupByDay(shown, now ?? new Date(), timeZone);
  const guildCount = new Set((data ?? []).map((event) => event.guild.id)).size;
  const count = (entry: (typeof TYPES)[number]) =>
    (data ?? []).filter((event) => !entry.kind || event.kind === entry.kind).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-sm font-semibold tracking-widest text-gold uppercase">
            The Division 2
          </p>
          <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-white sm:text-[40px]">
            Sorties en cours
          </h1>
          <p className="text-[17px] text-pretty text-stone-300">
            Les raids, incursions et missions prévus sur les serveurs du réseau. Une place te tente
            ? Rejoins le serveur, puis inscris-toi sous l’annonce de la sortie.
          </p>
        </div>
        {data && data.length > 0 && (
          <p className="text-sm text-stone-400 tabular-nums">
            {data.length} sortie{data.length > 1 ? 's' : ''} · {guildCount} serveur
            {guildCount > 1 ? 's' : ''}
          </p>
        )}
      </header>

      {invitation === 'indisponible' && (
        <div
          role="alert"
          className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-ember/60 bg-ember/10 p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <Icon name="alert" className="mt-0.5 size-5 text-[#ff8a4c]" />
            <p className="text-sm text-stone-200">
              <strong className="font-semibold text-white">Invitation indisponible.</strong> Ce
              serveur ne montre plus ses sorties, ou le bot n’a pas pu créer d’invitation. Essaie un
              peu plus tard, ou choisis une autre sortie.
            </p>
          </div>
          <Link
            from="/sorties"
            to="/sorties"
            search={(previous) => ({ ...previous, invitation: undefined })}
            className="text-sm font-medium text-stone-300 underline-offset-4 hover:text-white hover:underline"
          >
            Masquer
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav
          aria-label="Filtrer par type"
          className={`${segmentedClass} max-w-full overflow-x-auto`}
        >
          {TYPES.map((entry) => (
            <Link
              key={entry.label}
              to="/sorties"
              search={(previous) => ({ ...previous, type: entry.type })}
              activeOptions={{ explicitUndefined: true, includeSearch: true }}
              className={`${segmentClass} shrink-0 gap-2 max-sm:px-2.5`}
              activeProps={{ className: segmentActiveClass }}
            >
              {entry.label}
              {/* Sur téléphone, les quatre filtres tiennent sur une ligne sans leurs nombres */}
              {data && (
                <span className="text-xs text-stone-500 tabular-nums max-sm:hidden">
                  {count(entry)}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="w-full sm:w-auto">
          <Switch
            id="places-libres"
            label="Places libres seulement"
            checked={places === 'libres'}
            onChange={(event) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  places: event.target.checked ? 'libres' : undefined,
                }),
              })
            }
          />
        </div>
      </div>

      {error && <LoadError error={error} onRetry={() => void refetch()} />}
      {!error && !data && <PageSkeleton label="Chargement des sorties…" panels={2} />}

      {data && data.length === 0 && (
        <EmptyState
          icon="crosshair"
          title="Aucune sortie prévue pour l’instant"
          action={
            <Link to="/dashboard" className={buttonClass('ghost', 'min-h-11')}>
              Ouvrir le tableau de bord
            </Link>
          }
        >
          Les serveurs du réseau affichent ici leurs raids, incursions et missions. Tu gères un
          serveur ? Active la page publique dans l’onglet The Division 2 de son tableau de bord.
        </EmptyState>
      )}

      {data && data.length > 0 && shown.length === 0 && (
        <EmptyState
          icon="search"
          title="Aucune sortie ne correspond"
          action={
            <Link to="/sorties" search={{}} className={buttonClass('ghost', 'min-h-11')}>
              Voir toutes les sorties
            </Link>
          }
        >
          Essaie un autre type de sortie, ou affiche aussi celles qui sont complètes : la réserve y
          est encore ouverte.
        </EmptyState>
      )}

      {groups.map((group) => (
        <section
          key={group.key}
          aria-labelledby={`jour-${group.key}`}
          className="flex flex-col gap-3"
        >
          <h2
            id={`jour-${group.key}`}
            className="flex items-baseline gap-3 font-display text-lg font-semibold text-white"
          >
            {group.label}
            <span className="text-sm font-normal text-stone-500 tabular-nums">
              {group.events.length} sortie{group.events.length > 1 ? 's' : ''}
            </span>
          </h2>
          <ul className="flex flex-col gap-3">
            {group.events.map((event) => (
              <li key={event.id}>
                <PublicEventCard event={event} timeZone={timeZone} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
