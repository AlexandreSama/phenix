import type { MetricSeries, MetricsOverview, MetricsRange } from '@phenix/shared';
import { BarList } from '../../../components/charts/bar-list';
import { Panel } from '../../../components/ui/panel';
import { BAR_COLOR, SERIES_COLORS } from './colors';
import { formatBytes, formatCount, formatDateTime } from './format';
import { NO_SAMPLE_YET, SeriesChart } from './series-chart';

/** Les relevés du stockage à tracer : Postgres, Valkey, puis chaque bucket (six courbes au plus). */
export function storageLines(overview: MetricsOverview) {
  return [
    { name: 'postgres.bytes', label: 'Postgres' },
    { name: 'valkey.bytes', label: 'Valkey' },
    ...overview.storage.garage.map((bucket) => ({
      name: `garage.${bucket.name}.bytes`,
      label: `Garage · ${bucket.name}`,
    })),
  ]
    .slice(0, SERIES_COLORS.length)
    .map((line, index) => ({ ...line, color: SERIES_COLORS[index]! }));
}

function Figure({ term, value, detail }: { term: string; value: string; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-white/8 bg-surface-raised p-4">
      <dt className="text-sm text-stone-400">{term}</dt>
      <dd className="flex flex-col">
        <span className="font-display text-xl font-semibold text-white tabular-nums">{value}</span>
        {detail && <span className="text-xs text-stone-400">{detail}</span>}
      </dd>
    </div>
  );
}

interface StoragePanelProps {
  overview: MetricsOverview;
  series: MetricSeries | undefined;
  range: MetricsRange;
  now: number;
}

export function StoragePanel({ overview, series, range, now }: StoragePanelProps) {
  const { postgres, valkey, garage, takenAt } = overview.storage;
  const lines = storageLines(overview);
  return (
    <Panel
      title="Stockage"
      icon="server"
      description="La base Postgres, la mémoire de Valkey, et chaque bucket de Garage."
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <Figure
          term="Base Postgres"
          value={postgres.bytes === null ? '—' : formatBytes(postgres.bytes)}
          detail={postgres.bytes === null ? 'La base n’a pas répondu' : undefined}
        />
        <Figure
          term="Mémoire de Valkey"
          value={valkey.bytes === null ? '—' : formatBytes(valkey.bytes)}
          detail={
            valkey.bytes === null
              ? 'Valkey n’a pas répondu'
              : valkey.maxBytes === null
                ? 'Sans plafond'
                : `Plafond : ${formatBytes(valkey.maxBytes)}`
          }
        />
      </dl>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <h4 className="text-sm font-semibold text-white">Les plus grosses tables</h4>
          <BarList
            label="Les cinq plus grosses tables de Postgres, index compris"
            columns={['Table', 'Taille']}
            color={BAR_COLOR}
            items={postgres.tables.map((table) => ({
              key: table.name,
              label: table.name,
              value: table.bytes,
              display: formatBytes(table.bytes),
            }))}
            empty="La base n’a pas répondu."
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h4 className="text-sm font-semibold text-white">Buckets Garage</h4>
          <BarList
            label="Volume de chaque bucket Garage"
            columns={['Bucket', 'Volume']}
            color={BAR_COLOR}
            items={garage.map((bucket) => ({
              key: bucket.name,
              label: bucket.name,
              value: bucket.bytes,
              display: formatBytes(bucket.bytes),
              detail: `${formatCount(bucket.objects)} objet${bucket.objects > 1 ? 's' : ''}`,
            }))}
            empty={`${NO_SAMPLE_YET} Le bot a besoin de GARAGE_ADMIN_URL et GARAGE_ADMIN_TOKEN.`}
          />
          {takenAt && <p className="text-xs text-stone-500">Relevé du {formatDateTime(takenAt)}</p>}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <h4 className="text-sm font-semibold text-white">Évolution</h4>
        {series ? (
          <SeriesChart
            label="Volume du stockage dans le temps"
            data={series}
            range={range}
            lines={lines}
            formatValue={formatBytes}
            now={now}
          />
        ) : (
          <p className="text-sm text-stone-400">Chargement des courbes…</p>
        )}
      </div>
    </Panel>
  );
}
