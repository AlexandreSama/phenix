/** Une journée de la page des sorties : son titre, et ses sorties dans l'ordre de l'heure. */
export interface DayGroup<T> {
  key: string;
  label: string;
  events: T[];
}

/** « 2026-11-14 » : le jour d'une date dans ce fuseau (celui du navigateur sans fuseau donné). */
function dayKey(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Le jour qui suit, compté sur le calendrier : un changement d'heure n'y change rien. */
function nextDayKey(key: string): string {
  const next = new Date(`${key}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * Range les sorties par jour, dans le fuseau du visiteur : « Aujourd'hui », « Demain »,
 * puis « Samedi 21 novembre ». Les sorties arrivent déjà triées par l'API.
 */
export function groupByDay<T extends { scheduledAt: string }>(
  events: T[],
  now: Date,
  timeZone?: string,
): DayGroup<T>[] {
  const today = dayKey(now, timeZone);
  const tomorrow = nextDayKey(today);
  const longDay = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const groups = new Map<string, DayGroup<T>>();
  for (const event of events) {
    const date = new Date(event.scheduledAt);
    const key = dayKey(date, timeZone);
    let group = groups.get(key);
    if (!group) {
      const label =
        key === today
          ? 'Aujourd’hui'
          : key === tomorrow
            ? 'Demain'
            : longDay.format(date).replace(/^./, (first) => first.toUpperCase());
      group = { key, label, events: [] };
      groups.set(key, group);
    }
    group.events.push(event);
  }
  return [...groups.values()];
}
