/** Durée lisible : « 2 j 3 h 4 min », ou « moins d'une minute ». */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    days > 0 ? `${days} j` : '',
    hours > 0 ? `${hours} h` : '',
    minutes > 0 ? `${minutes} min` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : "moins d'une minute";
}

/** Octets en mégaoctets, arrondis. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} Mo`;
}
