/**
 * Lit une date saisie en français, telle qu'un joueur l'écrit dans Discord :
 * « samedi 21h », « demain 20h30 », « 14/11 21h », « 14 novembre 21h », « dans 2h ».
 * Les heures sont celles du fuseau du serveur (GuildConfig.timezone), pas celles de la machine.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1 à 12
  day: number;
  hour: number;
  minute: number;
  /** 0 = dimanche … 6 = samedi, comme Date.getDay() */
  weekday: number;
}

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** L'heure qu'affiche une horloge murale de ce fuseau à cet instant. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS_EN.indexOf(parts.weekday ?? ''),
  };
}

/** Décalage du fuseau à cet instant, en millisecondes (Paris en hiver : +1 h). */
function offsetAt(timestamp: number, timeZone: string): number {
  const p = zonedParts(new Date(timestamp), timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return wall - Math.floor(timestamp / 60_000) * 60_000;
}

/**
 * L'instant où l'horloge murale du fuseau affiche cette date et cette heure.
 * Deux passes : la première devine avec le décalage du moment, la seconde corrige
 * quand un changement d'heure tombe entre les deux.
 */
export function zonedTimeToUtc(
  wall: Pick<ZonedParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>,
  timeZone: string,
): Date {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const guess = asUtc - offsetAt(asUtc, timeZone);
  return new Date(asUtc - offsetAt(guess, timeZone));
}

export type DateParseResult = { ok: true; date: Date } | { ok: false; error: string };

export interface ParseOptions {
  now: Date;
  timeZone: string;
  /** Avance minimale sur maintenant (5 min par défaut) */
  minAheadMs?: number;
  /** Avance maximale (60 jours par défaut) */
  maxAheadMs?: number;
}

export const EVENT_DATE_LIMITS = {
  minAheadMs: 5 * 60_000,
  maxAheadMs: 60 * 86_400_000,
} as const;

export const EVENT_DATE_EXAMPLES = '« samedi 21h », « demain 20h30 », « 14/11 21h » ou « dans 2h »';

const DAY_NAMES: Record<string, number> = {
  dimanche: 0,
  dim: 0,
  lundi: 1,
  lun: 1,
  mardi: 2,
  mar: 2,
  mercredi: 3,
  mer: 3,
  jeudi: 4,
  jeu: 4,
  vendredi: 5,
  ven: 5,
  samedi: 6,
  sam: 6,
};

const MONTH_NAMES: Record<string, number> = {
  janvier: 1,
  janv: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

/** Mots qui n'apportent rien à la date : « samedi à 21h », « ce soir vers 21h »… */
const FILLERS = new Set([
  'a',
  'le',
  'la',
  'ce',
  'cet',
  'cette',
  'prochain',
  'prochaine',
  'vers',
  'soir',
  'matin',
  'apresmidi',
  'aprem',
  'de',
  'du',
  'pour',
]);

const RELATIVE =
  /^dans\s+(?:(\d+)\s*h(?:eures?)?\s*(\d+)?(?:\s*min(?:utes?)?)?|(\d+)\s*m(?:in(?:utes?)?)?)$/;
const TIME = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/;
const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/;
const TEXT_DATE = /^(\d{1,2}|1er)\s+([a-z]+)\.?(?:\s+(\d{4}))?$/;

/** Minuscules, sans accents ni ponctuation ; les mots composés collés en un seul. */
const normalize = (input: string) =>
  input
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '') // accents : les marques séparées par NFD
    .replaceAll(/[’`]/g, "'")
    .replaceAll(/[,;]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replaceAll(/\baujourd'?hui\b/g, 'aujourdhui')
    .replaceAll(/\bapres[- ]demain\b/g, 'apresdemain')
    .replaceAll(/\bapres[- ]midi\b/g, 'apresmidi');

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/** Ajoute des jours à une date de calendrier, sans fuseau ni heure d'été. */
function addDays({ year, month, day }: CalendarDay, days: number): CalendarDay {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function isRealDay({ year, month, day }: CalendarDay): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

const fail = (error: string): DateParseResult => ({ ok: false, error });

/** Lit l'heure : « 21h », « 21h30 », « 21:30 », « midi », « minuit ». Renvoie aussi le reste du texte. */
function readTime(text: string): { hour: number; minute: number; rest: string } | null {
  const match = TIME.exec(text);
  if (match) {
    return {
      hour: Number(match[1]),
      minute: Number(match[2] ?? 0),
      rest: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`,
    };
  }
  if (/\bmidi\b/.test(text)) return { hour: 12, minute: 0, rest: text.replace(/\bmidi\b/, ' ') };
  if (/\bminuit\b/.test(text)) return { hour: 0, minute: 0, rest: text.replace(/\bminuit\b/, ' ') };
  return null;
}

/** Lit une date explicite : « 14/11 », « 14/11/2026 », « 14 novembre », « 1er decembre 2026 ». */
function readExplicitDay(
  text: string,
  today: CalendarDay,
): (CalendarDay & { yearGiven: boolean }) | null {
  const numeric = NUMERIC_DATE.exec(text);
  if (numeric) {
    const raw = numeric[3];
    const year = raw ? (raw.length === 2 ? 2000 + Number(raw) : Number(raw)) : today.year;
    return { year, month: Number(numeric[2]), day: Number(numeric[1]), yearGiven: Boolean(raw) };
  }
  const textual = TEXT_DATE.exec(text);
  const month = textual ? MONTH_NAMES[textual[2] ?? ''] : undefined;
  if (textual && month) {
    const day = textual[1] === '1er' ? 1 : Number(textual[1]);
    const raw = textual[3];
    return { year: raw ? Number(raw) : today.year, month, day, yearGiven: Boolean(raw) };
  }
  return null;
}

export function parseEventDate(input: string, options: ParseOptions): DateParseResult {
  const { now, timeZone } = options;
  const minAhead = options.minAheadMs ?? EVENT_DATE_LIMITS.minAheadMs;
  const maxAhead = options.maxAheadMs ?? EVENT_DATE_LIMITS.maxAheadMs;
  const text = normalize(input);
  if (text === '') return fail(`Indique une date, par exemple ${EVENT_DATE_EXAMPLES}.`);

  const check = (date: Date): DateParseResult => {
    const ahead = date.getTime() - now.getTime();
    if (ahead < minAhead) {
      return fail('Cette date est passée ou trop proche : prévois au moins 5 minutes d’avance.');
    }
    if (ahead > maxAhead) return fail('Pas plus de 60 jours à l’avance.');
    return { ok: true, date };
  };

  // « dans 2h », « dans 1h30 », « dans 45 min »
  const relative = RELATIVE.exec(text);
  if (relative) {
    const minutes = relative[3]
      ? Number(relative[3])
      : Number(relative[1]) * 60 + Number(relative[2] ?? 0);
    return check(new Date(now.getTime() + minutes * 60_000));
  }

  const time = readTime(text);
  if (!time) return fail(`Précise l’heure, par exemple ${EVENT_DATE_EXAMPLES}.`);
  if (time.hour > 23 || time.minute > 59) return fail('Cette heure n’existe pas.');

  const words = time.rest
    .split(' ')
    .filter((word) => word !== '' && !FILLERS.has(word))
    .join(' ');
  const nowParts = zonedParts(now, timeZone);
  const today: CalendarDay = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
  const at = (day: CalendarDay) =>
    zonedTimeToUtc({ ...day, hour: time.hour, minute: time.minute }, timeZone);

  // Pas de jour : aujourd'hui si l'heure n'est pas passée, sinon demain
  if (words === '') {
    const sameDay = at(today);
    return check(sameDay.getTime() > now.getTime() ? sameDay : at(addDays(today, 1)));
  }
  if (words === 'aujourdhui') return check(at(today));
  if (words === 'demain') return check(at(addDays(today, 1)));
  if (words === 'apresdemain') return check(at(addDays(today, 2)));

  // Une date explicite ; un jour de la semaine devant (« samedi 14/11 ») est ignoré
  const withoutDayName = words
    .split(' ')
    .filter((word) => DAY_NAMES[word.replace(/\.$/, '')] === undefined)
    .join(' ');
  const explicit = readExplicitDay(withoutDayName, today);
  if (explicit) {
    if (!isRealDay(explicit)) return fail('Ce jour n’existe pas.');
    let date = at(explicit);
    // « 14/11 » déjà passé cette année : c'est l'an prochain
    if (!explicit.yearGiven && date.getTime() <= now.getTime()) {
      date = at({ ...explicit, year: explicit.year + 1 });
    }
    return check(date);
  }

  // « samedi » : le prochain samedi, aujourd'hui compris si l'heure n'est pas passée
  const weekday = DAY_NAMES[words.replace(/\.$/, '')];
  if (weekday !== undefined) {
    const ahead = (weekday - nowParts.weekday + 7) % 7;
    let date = at(addDays(today, ahead));
    if (date.getTime() <= now.getTime()) date = at(addDays(today, ahead + 7));
    return check(date);
  }

  return fail(`Je ne comprends pas « ${input.trim()} ». Essaie ${EVENT_DATE_EXAMPLES}.`);
}
