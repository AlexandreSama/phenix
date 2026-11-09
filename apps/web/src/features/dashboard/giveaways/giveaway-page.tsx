import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { buttonClass } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import {
  channelsQuery,
  giveawaysQuery,
  useGiveawayAction,
  type GiveawayStatusFilter,
} from '../api';
import { GiveawayCard } from './giveaway-card';

const TABS: { status: GiveawayStatusFilter; label: string; empty: string }[] = [
  { status: 'active', label: 'En cours', empty: 'Aucun giveaway en cours.' },
  { status: 'ended', label: 'Terminés', empty: 'Aucun giveaway terminé pour l’instant.' },
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

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-400">
          Le bot poste le giveaway, compte les participants et tire au sort à la date prévue.
        </p>
        <Link
          to="/dashboard/$guildId/giveaways/nouveau"
          params={{ guildId }}
          className={buttonClass('primary')}
        >
          Nouveau giveaway
        </Link>
      </div>

      <nav aria-label="Filtrer les giveaways" className="flex gap-2">
        {TABS.map((entry) => (
          <Link
            key={entry.status}
            to="/dashboard/$guildId/giveaways"
            params={{ guildId }}
            search={{ status: entry.status === 'active' ? undefined : entry.status }}
            activeOptions={{ explicitUndefined: true }}
            className="rounded-full border border-brown px-3 py-1 text-sm text-stone-400 hover:text-white"
            activeProps={{ className: 'border-flame! text-white!' }}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {action.error && (
        <p role="alert" className="text-sm text-flame">
          {action.error.message}
        </p>
      )}
      {giveaways.error && <p role="alert">{giveaways.error.message}</p>}
      {!giveaways.error && !data && <p>Chargement…</p>}
      {data?.giveaways.length === 0 && (
        <Card className="text-center text-stone-300">{tab.empty}</Card>
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
            className={buttonClass('ghost', data.page <= 1 ? 'pointer-events-none opacity-40' : '')}
          >
            ← Précédente
          </Link>
          <span className="text-sm text-stone-400 tabular-nums">
            Page {data.page} / {data.pageCount}
          </span>
          <Link
            to="/dashboard/$guildId/giveaways"
            params={{ guildId }}
            search={giveawaySearch(status, data.page + 1)}
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
