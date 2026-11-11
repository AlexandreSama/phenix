import type { CommandMetrics, MetricsRange } from '@phenix/shared';
import { METRICS_RANGES } from '@phenix/shared';
import { BarList } from '../../../components/charts/bar-list';
import { LineChart } from '../../../components/charts/line-chart';
import { Panel } from '../../../components/ui/panel';
import { BAR_COLOR, SERIES_COLORS } from './colors';
import { formatCount, formatDay, formatMs } from './format';

const TOP = 10;
const DAY = 86_400_000;

/** Un jour AAAA-MM-JJ, à minuit (heure locale) : un point de la courbe par jour. */
const dayStart = (day: string) => new Date(`${day}T00:00:00`).getTime();

export function CommandsPanel({
  data,
  range,
  now,
}: {
  data: CommandMetrics;
  range: MetricsRange;
  now: number;
}) {
  const shown = data.commands.slice(0, TOP);
  const others = data.commands.length - shown.length;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil(METRICS_RANGES[range].hours / 24);

  return (
    <Panel
      title="Commandes"
      icon="hash"
      description={`Les commandes les plus lancées sur ${METRICS_RANGES[range].label}, avec leurs erreurs et leur temps de réponse moyen.`}
    >
      <BarList
        label="Les commandes les plus utilisées"
        columns={['Commande', 'Utilisations']}
        color={BAR_COLOR}
        items={shown.map((command) => ({
          key: command.command,
          label: `/${command.command}`,
          value: command.count,
          display: formatCount(command.count),
          detail: `${formatCount(command.errors)} erreur${command.errors > 1 ? 's' : ''} · ${formatMs(command.avgDurationMs)} en moyenne`,
        }))}
        empty="Aucune commande lancée sur cette période."
      />
      {others > 0 && (
        <p className="text-xs text-stone-500">
          Et {others} autre{others > 1 ? 's' : ''} commande{others > 1 ? 's' : ''}.
        </p>
      )}

      <div className="flex min-w-0 flex-col gap-3">
        <h4 className="text-sm font-semibold text-white">Total par jour</h4>
        <LineChart
          label="Commandes lancées par jour"
          series={[
            {
              key: 'count',
              label: 'Commandes',
              color: SERIES_COLORS[0]!,
              points: data.daily.map((day) => ({ at: dayStart(day.day), value: day.count })),
            },
          ]}
          // Un jour de plus : 24 h ou 7 jours glissants débordent sur la veille du premier jour
          domain={[today.getTime() - days * DAY, today.getTime()]}
          gapMs={1.5 * DAY}
          formatValue={formatCount}
          formatAxisTime={(ms) => formatDay(new Date(ms).toLocaleDateString('en-CA'))}
          formatPointTime={(ms) => formatDay(new Date(ms).toLocaleDateString('en-CA'))}
          empty="Aucune commande lancée sur cette période."
        />
      </div>
    </Panel>
  );
}
