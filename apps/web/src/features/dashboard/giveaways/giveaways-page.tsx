import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { Icon } from '../../../components/icon';
import { buttonClass } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/panel';
import {
  channelsQuery,
  giveawaysQuery,
  useGiveawayAction,
  type GiveawayStatusFilter,
} from '../api';
import { pagerLinkClass, segmentActiveClass, segmentClass, segmentedClass } from '../list-controls';
import { LoadError, PageSkeleton } from '../query-state';
import { GiveawayCard } from './giveaway-card';

const TABS: { status: GiveawayStatusFilter; label: string; empty: string; hint: string }[] = [
  {
    status: 'active',
    label: 'En cours',
    empty: 'Aucun giveaway en cours',
    hint: 'Lance-en un : le bot le publie, compte les participants et tire au sort à la date prévue.',
  },
  {
    status: 'ended',
    label: 'Terminés',
    empty: 'Aucun giveaway terminé',
    hint: 'Les giveaways tirés au sort arrivent ici, avec leurs gagnants.',
  },
];

/** Valeurs par défaut absentes de l'URL : /giveaways reste propre. */
const giveawaySearch = (status: GiveawayStatusFilter, page = 1) => ({
  status: status === 'active' ? undefined : status,
  page: page > 1 ? page : undefined,
});

export function GiveawaysPage() {
  const { guildId } = useParams({ from: '/dashboard/$guildId/giveaways/' });
  const { status = 'active', page = 1 } = useSearch({ from: '/dashboard/$guildId/giveaways/' });
  const channels = useQuery(channelsQuery(guildId));
  const giveaways = useQuery(giveawaysQuery(guildId, status, page));
  const action = useGiveawayAction(guildId);
  const tab = TABS.find((entry) => entry.status === status) ?? TABS[0]!;
  const data = giveaways.data;

  const newGiveaway = (
    <Link
      to="/dashboard/$guildId/giveaways/nouveau"
      params={{ guildId }}
      className={buttonClass('primary')}
    >
      <Icon name="plus" className="size-4" />
      Nouveau giveaway
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Giveaways"
        description="Le bot poste le giveaway, compte les participants et tire au sort à la date prévue."
        actions={newGiveaway}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtrer les giveaways" className={segmentedClass}>
          {TABS.map((entry) => (
            <Link
              key={entry.status}
              to="/dashboard/$guildId/giveaways"
              params={{ guildId }}
              search={{ status: entry.status === 'active' ? undefined : entry.status }}
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
            {data.total} {data.total > 1 ? 'giveaways' : 'giveaway'}
          </p>
        )}
      </div>

      {action.error && (
        <p role="alert" className="text-sm text-flame">
          {action.error.message}
        </p>
      )}
      {giveaways.error && (
        <LoadError error={giveaways.error} onRetry={() => void giveaways.refetch()} />
      )}
      {!giveaways.error && !data && <PageSkeleton label="Chargement des giveaways…" panels={2} />}
      {data?.giveaways.length === 0 && (
        <EmptyState
          icon="gift"
          title={tab.empty}
          action={status === 'active' ? newGiveaway : undefined}
        >
          {tab.hint}
        </EmptyState>
      )}
      {data && data.giveaways.length > 0 && (
        <ul
          aria-label={`Giveaways ${tab.label.toLowerCase()}`}
          className={`flex flex-col gap-3 transition-opacity ${giveaways.isPlaceholderData ? 'opacity-60' : ''}`}
        >
          {data.giveaways.map((giveaway) => (
            <li key={giveaway.id}>
              <GiveawayCard
                giveaway={giveaway}
                channel={channels.data?.find((channel) => channel.id === giveaway.channelId)}
                onAction={(kind) => action.mutateAsync({ id: giveaway.id, action: kind })}
              />
            </li>
          ))}
        </ul>
      )}

      {data && data.pageCount > 1 && (
        <nav aria-label="Pages des giveaways" className="flex items-center justify-between gap-4">
          <Link
            to="/dashboard/$guildId/giveaways"
            params={{ guildId }}
            search={giveawaySearch(status, data.page - 1)}
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
            to="/dashboard/$guildId/giveaways"
            params={{ guildId }}
            search={giveawaySearch(status, data.page + 1)}
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
