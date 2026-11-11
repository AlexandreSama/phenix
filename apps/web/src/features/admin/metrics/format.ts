import type { MetricsRange } from '@phenix/shared';

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('fr-FR');

/** 1 536 → « 1,5 Ko » : en puissances de 1 024, comme Docker et les systèmes de fichiers. */
export function formatBytes(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes;
  let unit = 0;
  while (Math.abs(value) >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${number.format(value)} ${units[unit]}`;
}

export const formatCount = (value: number): string => integer.format(Math.round(value));

export const formatPercent = (value: number): string =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} %`;

export const formatMs = (value: number): string =>
  value >= 1000 ? `${number.format(value / 1000)} s` : `${integer.format(Math.round(value))} ms`;

/** 93 784 s → « 1 j 2 h » ; 3 900 s → « 1 h 5 min » ; 42 s → « 42 s ». */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${Math.floor(seconds)} s`;
}

const hourFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayHourFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** L'heure d'un point : « 14:05 » sur 24 h, « 3 nov. » sur l'axe des plages plus longues. */
export const axisTime = (range: MetricsRange) => (ms: number) =>
  (range === '24h' ? hourFormat : dayFormat).format(ms);

/** L'heure d'un point dans l'infobulle et le tableau : toujours avec le jour hors 24 h. */
export const pointTime = (range: MetricsRange) => (ms: number) =>
  (range === '24h' ? hourFormat : dayHourFormat).format(ms);

/** Un jour AAAA-MM-JJ (heure de Paris, venu de l'API) : « 3 nov. ». */
export const formatDay = (day: string): string => dayFormat.format(new Date(`${day}T12:00:00`));

export const formatDateTime = (iso: string): string => dayHourFormat.format(new Date(iso));
