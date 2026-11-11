import { TD2_EVENT_KIND_LABELS, type PublicTd2Event } from '@phenix/shared';
import { useId } from 'react';
import { GuildIcon } from '../../components/guild-icon';
import { Icon } from '../../components/icon';
import { Badge } from '../../components/ui/badge';
import { buttonClass } from '../../components/ui/button';
import { EVENT_KIND_ICONS, eventDetail, fillPercent } from '../../lib/td2-events';
import { joinUrl } from './api';

interface Props {
  event: PublicTd2Event;
  /** Le fuseau d'affichage ; celui du navigateur par défaut (les tests en fixent un) */
  timeZone?: string;
}

/** Une sortie de la page publique : quand, quoi, où, combien de places, et la porte d'entrée. */
export function PublicEventCard({ event, timeZone }: Props) {
  const titleId = useId();
  const date = new Date(event.scheduledAt);
  const time = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  const detail = eventDetail(event);
  const full = event.confirmed >= event.capacity;
  const free = event.capacity - Math.min(event.confirmed, event.capacity);

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-2xl border border-white/8 bg-surface p-4 transition hover:border-white/14 sm:p-5"
    >
      <time
        dateTime={event.scheduledAt}
        className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-white/5 py-2.5 font-display text-lg font-semibold text-white tabular-nums"
      >
        {time}
      </time>

      <div className="flex min-w-0 flex-[1_1_15rem] flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-flame uppercase">
          <Icon name={EVENT_KIND_ICONS[event.kind]} className="size-3.5" />
          {TD2_EVENT_KIND_LABELS[event.kind]}
          {detail && <span className="text-stone-400">· {detail}</span>}
        </p>
        <h3 id={titleId} className="font-display text-lg leading-snug font-semibold text-white">
          {event.activity}
        </h3>
        {event.directives.length > 0 && (
          <ul aria-label="Directives" className="flex flex-wrap gap-1.5">
            {event.directives.map((directive) => (
              <li
                key={directive}
                className="rounded-full border border-gold/30 bg-gold/8 px-2.5 py-0.5 text-xs text-gold"
              >
                {directive}
              </li>
            ))}
          </ul>
        )}
        <p className="flex min-w-0 items-center gap-2 text-sm text-stone-400">
          <GuildIcon
            name={event.guild.name}
            iconUrl={event.guild.iconUrl}
            className="size-5 text-[9px]"
          />
          <span className="truncate">{event.guild.name}</span>
        </p>
      </div>

      <div className="flex w-full flex-col gap-3 sm:w-56">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center justify-between gap-2 text-sm">
            <span className={`tabular-nums ${full ? 'text-gold' : 'text-stone-200'}`}>
              {event.confirmed}/{event.capacity} joueurs
            </span>
            {full ? (
              <Badge tone="gold">Complet</Badge>
            ) : (
              <span className="text-stone-400">
                {free} place{free > 1 ? 's' : ''}
              </span>
            )}
          </p>
          <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/8">
            <span
              className={`block h-full rounded-full ${full ? 'bg-gold' : 'bg-flame'}`}
              style={{ width: `${fillPercent(event)}%` }}
            />
          </span>
          {/* Complète, une sortie prend encore des inscrits : ils attendent une place en réserve */}
          {(full || event.reserve > 0) && (
            <p className="text-[13px] text-stone-400">
              {full ? 'Réserve ouverte' : 'Réserve'}
              {event.reserve > 0 && ` · ${event.reserve} en attente`}
            </p>
          )}
        </div>
        {/* Un nouvel onglet : Discord s'ouvre, la liste reste là pour une autre sortie */}
        <a
          href={joinUrl(event.guild.id)}
          target="_blank"
          rel="noopener"
          aria-label={`Rejoindre ce serveur : ${event.guild.name} (nouvel onglet)`}
          className={buttonClass(full ? 'ghost' : 'primary', 'min-h-11 w-full')}
        >
          Rejoindre ce serveur
          <Icon name="external" className="size-4" />
        </a>
      </div>
    </article>
  );
}
