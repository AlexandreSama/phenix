import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  metricsRangeQuerySchema,
  metricsSeriesQuerySchema,
  type CommandMetrics,
  type GuildMetrics,
  type MetricSeries,
  type MetricsOverview,
  type MetricsRangeQuery,
  type MetricsSeriesQuery,
} from '@phenix/shared';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { OwnerGuard } from '../../common/guards/owner.guard.js';
import { AdminMetricsService } from './admin-metrics.service.js';

/** La page Métriques : réservée aux propriétaires du bot. */
@Controller('admin/metrics')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminMetricsController {
  constructor(private readonly metrics: AdminMetricsService) {}

  @Get('overview')
  overview(): Promise<MetricsOverview> {
    return this.metrics.overview();
  }

  @Get('commands')
  commands(
    @Query({ schema: metricsRangeQuerySchema }) { range }: MetricsRangeQuery,
  ): Promise<CommandMetrics> {
    return this.metrics.commands(range);
  }

  @Get('guilds')
  guilds(
    @Query({ schema: metricsRangeQuerySchema }) { range }: MetricsRangeQuery,
  ): Promise<GuildMetrics> {
    return this.metrics.guilds(range);
  }

  @Get('series')
  series(
    @Query({ schema: metricsSeriesQuerySchema }) { names, range }: MetricsSeriesQuery,
  ): Promise<MetricSeries> {
    return this.metrics.series(names, range);
  }
}
