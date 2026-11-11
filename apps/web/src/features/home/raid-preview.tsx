import { useId } from 'react';
import { Icon } from '../../components/icon';

/** Une sortie d'exemple, au format du message que le bot publie (td2EventMessage). */
const LINEUP = [
  { role: 'DPS', count: 6, players: ['Agent47', 'Rook', 'Kestrel', 'Vale'] },
  { role: 'Heal', count: 1, players: ['Faye'] },
  { role: 'Tank', count: 1, players: ['Brick'] },
];
const RESERVE = [{ player: 'Nova', role: 'Tank' }];
const ORGANIZER = 'Faye';
const EVENT_ID = 42;

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

/**
 * Le prochain samedi à 21 h, heure du visiteur, jamais le jour même :
 * l'exemple garde une date à venir, quel que soit le jour de la visite.
 */
export function nextRaid(now: Date): { date: Date; days: number } {
  const days = (6 - now.getDay() + 7) % 7 || 7;
  const date = new Date(now);
  date.setDate(now.getDate() + days);
  date.setHours(21, 0, 0, 0);
  return { date, days };
}

/** « samedi 14 novembre 2026 à 21:00 · dans 3 jours » */
export function raidWhen(now: Date): string {
  const { date, days } = nextRaid(now);
  return `${DATE_FORMAT.format(date)} · ${RELATIVE_FORMAT.format(days, 'day')}`;
}

/** L'aperçu d'une sortie The Division 2 : une illustration, pas un vrai message. */
export function RaidPreview({ now = new Date() }: { now?: Date }) {
  const captionId = useId();
  const capacity = LINEUP.reduce((total, slot) => total + slot.count, 0);
  const filled = LINEUP.reduce((total, slot) => total + slot.players.length, 0);

  return (
    <figure aria-labelledby={captionId} className="flex flex-col gap-3.5">
      {/* Les lecteurs d'écran s'en tiennent à la légende : le détail ne sert qu'à voir */}
      <div
        aria-hidden="true"
        className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-surface p-5 shadow-[0_32px_80px_rgb(0_0_0/0.4)] sm:p-6"
      >
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="size-9 rounded-full" />
          <span className="font-semibold text-white">PhenixMG</span>
          <span className="rounded-md bg-flame/15 px-2 py-0.5 text-xs font-semibold tracking-wide text-[#ff8a4c]">
            BOT
          </span>
        </div>

        <div className="flex flex-col gap-3.5">
          <p className="font-display text-xl font-semibold tracking-tight text-white sm:text-[22px]">
            Raid Dark Hours · Normal
          </p>
          <div className="flex flex-col gap-2 text-sm text-stone-300">
            <span className="flex items-center gap-2.5">
              <Icon name="calendar" className="size-4 text-gold" />
              {raidWhen(now)}
            </span>
            <span className="flex items-center gap-2.5">
              <Icon name="user" className="size-4 text-gold" />
              <span>
                Organisée par <span className="font-medium text-white">@{ORGANIZER}</span>
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-white">
              {filled}/{capacity} joueurs
            </span>
            <span className="text-stone-400">{RESERVE.length} en réserve</span>
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${capacity}, 1fr)` }}>
            {Array.from({ length: capacity }, (_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full ${index < filled ? 'bg-flame' : 'bg-white/12'}`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {LINEUP.map((slot) => (
            <div
              key={slot.role}
              className="flex flex-col gap-1.5 rounded-xl bg-white/4 p-3 text-sm sm:p-3.5"
            >
              <span className="text-xs font-semibold tracking-wider text-stone-400 uppercase">
                {slot.role} · {slot.players.length}/{slot.count}
              </span>
              {slot.players.map((player) => (
                <span key={player} className="truncate text-stone-100">
                  @{player}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-stone-300">
            Réserve&nbsp;:{' '}
            {RESERVE.map(({ player, role }) => (
              <span key={player}>
                <span className="text-white">@{player}</span> ({role})
              </span>
            ))}
          </span>
          <span className="text-stone-400">Sortie #{EVENT_ID}</span>
        </div>

        {/* Les boutons du message : un rôle complet passe en gris, comme sur Discord */}
        <div className="flex flex-wrap gap-2 border-t border-white/8 pt-4">
          {LINEUP.map((slot) => (
            <span
              key={slot.role}
              className={`rounded-lg px-3 py-2.5 text-sm ${
                slot.players.length < slot.count
                  ? 'bg-flame font-semibold text-ink'
                  : 'bg-white/10 font-medium text-stone-100'
              }`}
            >
              {slot.role} {slot.players.length}/{slot.count}
            </span>
          ))}
          <span className="rounded-lg border border-white/15 px-3 py-2.5 text-sm font-medium text-stone-300">
            Se désinscrire
          </span>
          <span className="rounded-lg border border-white/15 px-3 py-2.5 text-sm font-medium text-stone-300">
            Gérer
          </span>
        </div>
      </div>
      <figcaption id={captionId} className="text-center text-sm text-stone-400">
        Une sortie publiée par le bot&nbsp;: chacun s'inscrit dans son rôle d'un clic.
      </figcaption>
    </figure>
  );
}
