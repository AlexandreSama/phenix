import {
  METRICS,
  type CommandMetrics,
  type GuildMetrics,
  type MetricSeries,
  type MetricsOverview,
  type MetricsRange,
} from '@phenix/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../../lib/api';

/** L'état en direct : redemandé toutes les 30 s, au rythme des battements. */
export const overviewQuery = queryOptions({
  queryKey: ['admin', 'metrics', 'overview'],
  queryFn: () => api<MetricsOverview>('/admin/metrics/overview'),
  refetchInterval: METRICS.live.intervalSeconds * 1000,
});

export const commandsQuery = (range: MetricsRange) =>
  queryOptions({
    queryKey: ['admin', 'metrics', 'commands', range],
    queryFn: () => api<CommandMetrics>(`/admin/metrics/commands?range=${range}`),
    refetchInterval: 60_000,
  });

export const guildsQuery = (range: MetricsRange) =>
  queryOptions({
    queryKey: ['admin', 'metrics', 'guilds', range],
    queryFn: () => api<GuildMetrics>(`/admin/metrics/guilds?range=${range}`),
    refetchInterval: 60_000,
  });

/** Les courbes : un relevé arrive toutes les 5 minutes, inutile de redemander plus souvent. */
export const seriesQuery = (names: readonly string[], range: MetricsRange) =>
  queryOptions({
    queryKey: ['admin', 'metrics', 'series', range, names],
    queryFn: () => {
      const params = new URLSearchParams({ names: names.join(','), range });
      return api<MetricSeries>(`/admin/metrics/series?${params.toString()}`);
    },
    refetchInterval: 60_000,
  });
