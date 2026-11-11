import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

export interface LineSeries {
  key: string;
  label: string;
  /** Couleur du trait ; le texte, lui, reste dans les couleurs du texte */
  color: string;
  points: { at: number; value: number }[];
}

interface LineChartProps {
  /** Le nom du graphique, lu par les lecteurs d'écran */
  label: string;
  series: LineSeries[];
  /** Le début et la fin de l'axe du temps, en millisecondes */
  domain: [number, number];
  /** Deux points plus éloignés que ça ne sont pas reliés : le service ne répondait pas */
  gapMs: number;
  /** Le haut de l'échelle (100 pour un pourcentage) ; sinon, un peu au-dessus du maximum */
  yMax?: number;
  formatValue: (value: number) => string;
  formatAxisTime: (ms: number) => string;
  formatPointTime: (ms: number) => string;
  /** Affiché à la place du graphique quand aucune courbe n'a de point */
  empty: ReactNode;
}

const WIDTH = 1000;
const HEIGHT = 200;

/** Un haut d'échelle rond : 1, 2, 2,5 ou 5 fois une puissance de 10, au-dessus de `value`. */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= value) ?? 10;
  return step * power;
}

/** Le tracé d'une courbe, coupé là où il manque des relevés. */
function pathOf(
  points: LineSeries['points'],
  x: (ms: number) => number,
  y: (value: number) => number,
  gapMs: number,
): string {
  let d = '';
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];
    const startsRun = !previous || point.at - previous.at > gapMs;
    const endsRun = !next || next.at - point.at > gapMs;
    const px = x(point.at).toFixed(1);
    const py = y(point.value).toFixed(1);
    // Un point seul : un petit trait, que le bout arrondi rend visible
    if (startsRun && endsRun) d += `M${Number(px) - 3} ${py}h6`;
    else d += `${startsRun ? 'M' : 'L'}${px} ${py}`;
  });
  return d;
}

/**
 * Des courbes dans le temps, en SVG maison : une échelle, une légende, une infobulle au survol
 * (et aux flèches du clavier), et le tableau des valeurs pour qui ne voit pas le graphique.
 */
export function LineChart({
  label,
  series,
  domain,
  gapMs,
  yMax,
  formatValue,
  formatAxisTime,
  formatPointTime,
  empty,
}: LineChartProps) {
  const tableId = useId();
  const [active, setActive] = useState<number | null>(null);

  const times = useMemo(
    () => [...new Set(series.flatMap((s) => s.points.map((p) => p.at)))].sort((a, b) => a - b),
    [series],
  );
  const byTime = useMemo(
    () => series.map((s) => new Map(s.points.map((p) => [p.at, p.value]))),
    [series],
  );

  if (times.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/12 px-4 py-10 text-center text-sm text-stone-400">
        {empty}
      </p>
    );
  }

  const [start, end] = domain;
  const span = Math.max(1, end - start);
  const max = Math.max(...series.flatMap((s) => s.points.map((p) => p.value)));
  const top = yMax ?? niceCeil(max * 1.1);
  const x = (ms: number) => ((ms - start) / span) * WIDTH;
  const y = (value: number) => HEIGHT - (Math.min(value, top) / top) * HEIGHT;
  const percentX = (ms: number) => `${Math.min(100, Math.max(0, ((ms - start) / span) * 100))}%`;
  const ticks = [0, 0.5, 1].map((share) => share * top);
  const axisTicks = [0, 1 / 3, 2 / 3, 1].map((share) => start + share * span);

  const activeTime = active === null ? undefined : times[active];
  const nearest = (ms: number) => {
    let best = 0;
    times.forEach((time, index) => {
      if (Math.abs(time - ms) < Math.abs((times[best] ?? 0) - ms)) best = index;
    });
    return best;
  };
  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const share = (event.clientX - box.left) / Math.max(1, box.width);
    setActive(nearest(start + share * span));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = times.length - 1;
    const moves: Record<string, number> = {
      ArrowLeft: Math.max(0, (active ?? last + 1) - 1),
      ArrowRight: Math.min(last, (active ?? -1) + 1),
      Home: 0,
      End: last,
    };
    if (event.key === 'Escape') setActive(null);
    else if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key] ?? null);
    }
  };

  // Ce que dit le graphique en une phrase : la dernière valeur de chaque courbe
  const summary = series
    .map((s) => {
      const last = s.points.at(-1);
      return `${s.label} : ${last ? formatValue(last.value) : 'aucun relevé'}`;
    })
    .join(', ');

  return (
    <figure className="flex flex-col gap-3">
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-300">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-0.5 w-4 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* L'échelle, en HTML : le SVG s'étire, le texte non */}
        <div
          aria-hidden="true"
          className="relative h-44 w-14 text-right text-xs text-stone-500 tabular-nums"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
              style={{ top: `${100 - (tick / top) * 100}%` }}
            >
              {formatValue(tick)}
            </span>
          ))}
        </div>

        <div
          role="img"
          aria-label={`${label}. ${summary}. Valeurs détaillées dans le tableau qui suit.`}
          aria-describedby={tableId}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="relative h-44 touch-pan-y rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-gold"
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden="true"
          >
            {ticks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={WIDTH}
                y1={y(tick)}
                y2={y(tick)}
                stroke="currentColor"
                className={tick === 0 ? 'text-white/20' : 'text-white/8'}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {series.map((s) => (
              <path
                key={s.key}
                d={pathOf(s.points, x, y, gapMs)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {activeTime !== undefined && (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 w-px bg-white/30"
                style={{ left: percentX(activeTime) }}
              />
              {series.map((s, index) => {
                const value = byTime[index]?.get(activeTime);
                return value === undefined ? null : (
                  <span
                    key={s.key}
                    aria-hidden="true"
                    className="pointer-events-none absolute size-2.5 -translate-1/2 rounded-full ring-2 ring-surface"
                    style={{
                      left: percentX(activeTime),
                      top: `${(y(value) / HEIGHT) * 100}%`,
                      background: s.color,
                    }}
                  />
                );
              })}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute top-0 z-10 flex min-w-36 flex-col gap-1 rounded-lg border border-white/10 bg-surface-raised px-3 py-2 text-xs shadow-lg ${
                  (activeTime - start) / span > 0.55
                    ? '-translate-x-[calc(100%+12px)]'
                    : 'translate-x-3'
                }`}
                style={{ left: percentX(activeTime) }}
              >
                <span className="font-medium text-stone-300">{formatPointTime(activeTime)}</span>
                {series.map((s, index) => {
                  const value = byTime[index]?.get(activeTime);
                  return (
                    <span
                      key={s.key}
                      className="flex items-center justify-between gap-3 text-white"
                    >
                      <span className="flex items-center gap-1.5 text-stone-300">
                        <span className="size-2 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <span className="tabular-nums">
                        {value === undefined ? '—' : formatValue(value)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div aria-hidden="true" className="relative col-start-2 mt-1.5 h-4 text-xs text-stone-500">
          {axisTicks.map((tick, index) => (
            <span
              key={tick}
              className={`absolute whitespace-nowrap ${
                index === 0
                  ? ''
                  : index === axisTicks.length - 1
                    ? '-translate-x-full'
                    : '-translate-x-1/2'
              }`}
              style={{ left: percentX(tick) }}
            >
              {formatAxisTime(tick)}
            </span>
          ))}
        </div>
      </div>

      <details id={tableId} className="group text-sm text-stone-300">
        <summary className="w-fit cursor-pointer rounded text-stone-400 hover:text-white focus-visible:outline-2 focus-visible:outline-gold">
          Voir les valeurs
        </summary>
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/8">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-surface-raised text-xs text-stone-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Heure
                </th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...times].reverse().map((time) => (
                <tr key={time} className="border-t border-white/6">
                  <th
                    scope="row"
                    className="px-3 py-1.5 font-normal whitespace-nowrap text-stone-400"
                  >
                    {formatPointTime(time)}
                  </th>
                  {series.map((s, index) => {
                    const value = byTime[index]?.get(time);
                    return (
                      <td key={s.key} className="px-3 py-1.5 text-right whitespace-nowrap">
                        {value === undefined ? '—' : formatValue(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
