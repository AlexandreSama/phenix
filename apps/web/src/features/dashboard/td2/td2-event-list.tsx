import { TD2_KIND_LABELS, type GuildChannelSummary, type Td2EventSummary } from '@phenix/shared';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

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
      <p className="text-sm text-stone-400">
        Aucune sortie prévue. Lance <code>/td2 raid</code> ou <code>/td2 incursion</code> sur
        Discord.
      </p>
    );
  }
  return (
    <ul aria-label="Sorties à venir" className="flex flex-col divide-y divide-brown">
      {events.map((event) => {
        const channel = channels.find((entry) => entry.id === event.channelId);
        const full = event.confirmed >= event.capacity;
        return (
          <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-white">{eventName(event)}</p>
              <p className="text-sm text-stone-400">
                {dateTime.format(new Date(event.scheduledAt))} · #
                {channel?.name ?? 'salon supprimé'}
              </p>
            </div>
            <p className={`text-sm tabular-nums ${full ? 'text-gold' : 'text-stone-300'}`}>
              {event.confirmed}/{event.capacity} joueurs
              {event.reserve > 0 ? ` · ${event.reserve} en réserve` : ''}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
