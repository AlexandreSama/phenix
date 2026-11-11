import { TD2_KIND_LABELS, type GuildChannelSummary, type Td2EventSummary } from '@phenix/shared';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';

const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fullDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « Raid Dark Hours · Normal », « Incursion Paradis Perdu » : comme sur Discord. */
export function eventName(event: Pick<Td2EventSummary, 'kind' | 'activity' | 'mode'>): string {
  const mode = event.kind === 'RAID' ? ` · ${event.mode}` : '';
  return `${TD2_KIND_LABELS[event.kind]} ${event.activity}${mode}`;
}

interface Props {
  events: Td2EventSummary[];
  channels: GuildChannelSummary[];
}

/** Les sorties à venir. On s'inscrit sur Discord : ici, on suit le remplissage. */
export function Td2EventList({ events, channels }: Props) {
  if (events.length === 0) {
    return (
      <div className="p-5 sm:p-6">
        <EmptyState icon="crosshair" title="Aucune sortie prévue">
          Lance <code className="font-mono text-stone-200">/td2 raid</code> ou{' '}
          <code className="font-mono text-stone-200">/td2 incursion</code> sur Discord : la sortie
          apparaîtra ici, avec son remplissage.
        </EmptyState>
      </div>
    );
  }
  return (
    <ul aria-label="Sorties à venir" className="flex flex-col divide-y divide-white/6">
      {events.map((event) => {
        const channel = channels.find((entry) => entry.id === event.channelId);
        const date = new Date(event.scheduledAt);
        const full = event.confirmed >= event.capacity;
        const percent = Math.round(
          (Math.min(event.confirmed, event.capacity) / event.capacity) * 100,
        );
        return (
          <li
            key={event.id}
            className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 sm:px-6"
          >
            {/* La date en pavé, lisible d'un coup d'œil ; la phrase complète pour les lecteurs d'écran */}
            <span
              aria-hidden="true"
              className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-white/5 py-2 leading-tight"
            >
              <span className="text-[11px] font-semibold text-stone-400 uppercase">
                {weekday.format(date).replace('.', '')}
              </span>
              <span className="font-display text-sm font-semibold text-white">
                {dayMonth.format(date).replace('.', '')}
              </span>
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-semibold text-white">{eventName(event)}</p>
                {full && <Badge tone="gold">Complet</Badge>}
              </div>
              <p className="text-sm text-stone-400">
                <span className="sr-only">{fullDate.format(date)} · </span>
                <span aria-hidden="true">{time.format(date)} · </span>#
                {channel?.name ?? 'salon supprimé'}
              </p>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-52">
              <p className={`text-sm tabular-nums ${full ? 'text-gold' : 'text-stone-300'}`}>
                {event.confirmed}/{event.capacity} joueurs
                {event.reserve > 0 ? ` · ${event.reserve} en réserve` : ''}
              </p>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <span
                  className={`block h-full rounded-full ${full ? 'bg-gold' : 'bg-flame'}`}
                  style={{ width: `${percent}%` }}
                />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
