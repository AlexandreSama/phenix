import { METRICS_RANGE_KEYS, METRICS_RANGES, type MetricsRange } from '@phenix/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { Panel, PageHeader } from '../../../components/ui/panel';
import { segmentActiveClass, segmentClass, segmentedClass } from '../../dashboard/list-controls';
import { firstFailure, LoadError, PageSkeleton } from '../../dashboard/query-state';
import { commandsQuery, guildsQuery, overviewQuery, seriesQuery } from './api';
import { SERVICE_COLORS } from './colors';
import { CommandsPanel } from './commands-panel';
import { formatBytes, formatPercent } from './format';
import { GuildsTable } from './guilds-table';
import { KeyFigures, LivePanel } from './live-panel';
import { SeriesChart } from './series-chart';
import { StoragePanel, storageLines } from './storage-panel';

const PROCESS_NAMES = ['bot.cpu', 'api.cpu', 'bot.memory', 'api.memory'] as const;
const SHORT_LABELS: Record<MetricsRange, string> = { '24h': '24 h', '7d': '7 j', '30d': '30 j' };

/** Les deux courbes d'un relevé du processus : le bot, puis l'API. */
const processLines = (metric: 'cpu' | 'memory') => [
  { name: `bot.${metric}`, label: 'Bot', color: SERVICE_COLORS.bot },
  { name: `api.${metric}`, label: 'API', color: SERVICE_COLORS.api },
];

/**
 * Les métriques des propriétaires du bot : commandes, serveurs, CPU et RAM, stockage.
 * La plage choisie vit dans l'adresse ; l'état en direct se rafraîchit toutes les 30 secondes.
 */
export function MetricsPage() {
  const range = useSearch({ from: '/admin/metriques' }).range ?? '24h';
  const overview = useQuery(overviewQuery);
  const commands = useQuery(commandsQuery(range));
  const guilds = useQuery(guildsQuery(range));
  const process = useQuery(seriesQuery(PROCESS_NAMES, range));
  const lines = overview.data ? storageLines(overview.data) : [];
  const storage = useQuery({
    ...seriesQuery(
      lines.map((line) => line.name),
      range,
    ),
    // Les buckets viennent de l'aperçu : on attend de les connaître
    enabled: overview.isSuccess,
  });
  const { error, retry } = firstFailure([overview, commands, guilds, process, storage]);
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Métriques"
        description="L’usage du bot sur tous ses serveurs, et ce que consomment le bot, l’API et le stockage. Aucune donnée sur les membres : seulement la commande et le serveur."
        actions={
          <nav aria-label="Période" className={segmentedClass}>
            {METRICS_RANGE_KEYS.map((key) => (
              <Link
                key={key}
                to="/admin/metriques"
                search={{ range: key }}
                activeOptions={{ includeSearch: true }}
                className={segmentClass}
                activeProps={{ className: segmentActiveClass }}
                aria-label={METRICS_RANGES[key].label}
              >
                {SHORT_LABELS[key]}
              </Link>
            ))}
          </nav>
        }
      />

      {error ? (
        <LoadError error={error} onRetry={retry} />
      ) : !overview.data || !commands.data || !guilds.data || !process.data ? (
        <PageSkeleton label="Chargement des métriques" panels={3} />
      ) : (
        <>
          <KeyFigures overview={overview.data} range={range} />
          <LivePanel overview={overview.data} />

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="Processeur"
              icon="chart"
              description="En % des CPU permis à chaque conteneur, un relevé toutes les 5 minutes."
            >
              <SeriesChart
                label="CPU du bot et de l’API"
                data={process.data}
                range={range}
                lines={processLines('cpu')}
                formatValue={formatPercent}
                yMax={100}
                now={now}
              />
            </Panel>
            <Panel
              title="Mémoire"
              icon="chart"
              description="La mémoire utilisée, sans le cache disque que le noyau reprend au besoin."
            >
              <SeriesChart
                label="Mémoire du bot et de l’API"
                data={process.data}
                range={range}
                lines={processLines('memory')}
                formatValue={formatBytes}
                now={now}
              />
            </Panel>
          </div>

          <StoragePanel overview={overview.data} series={storage.data} range={range} now={now} />
          <CommandsPanel data={commands.data} range={range} now={now} />
          <GuildsTable data={guilds.data} range={range} />
        </>
      )}
    </div>
  );
}
