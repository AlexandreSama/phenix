import type { MetricSeries, MetricsRange } from '@phenix/shared';
import { METRICS_RANGES } from '@phenix/shared';
import { LineChart } from '../../../components/charts/line-chart';
import { axisTime, pointTime } from './format';

export const NO_SAMPLE_YET = 'Pas encore de relevé : le premier arrive dans 5 minutes.';

interface SeriesChartProps {
  label: string;
  data: MetricSeries;
  range: MetricsRange;
  /** Le libellé et la couleur de chaque relevé à tracer, dans l'ordre de la légende */
  lines: { name: string; label: string; color: string }[];
  formatValue: (value: number) => string;
  yMax?: number;
  /** L'heure du calcul de la page : la fin de l'axe du temps */
  now: number;
}

/** Les courbes des relevés de la plage choisie, sur l'axe de cette plage. */
export function SeriesChart({
  label,
  data,
  range,
  lines,
  formatValue,
  yMax,
  now,
}: SeriesChartProps) {
  const byName = new Map(data.series.map((series) => [series.name, series.points]));
  return (
    <LineChart
      label={label}
      series={lines.map((line) => ({
        key: line.name,
        label: line.label,
        color: line.color,
        points: (byName.get(line.name) ?? []).map((point) => ({
          at: Date.parse(point.at),
          value: point.value,
        })),
      }))}
      domain={[now - METRICS_RANGES[range].hours * 3600_000, now]}
      // Plus de deux pas et demi sans relevé : le service ne tournait pas, la courbe se coupe
      gapMs={data.binMinutes * 60_000 * 2.5}
      yMax={yMax}
      formatValue={formatValue}
      formatAxisTime={axisTime(range)}
      formatPointTime={pointTime(range)}
      empty={NO_SAMPLE_YET}
    />
  );
}
