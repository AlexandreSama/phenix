import { Module } from '@nestjs/common';
import { createEvidenceStorage } from '@phenix/storage';
import { OwnerGuard } from '../../common/guards/owner.guard.js';
import { ENV, EVIDENCE } from '../../core/tokens.js';
import type { Env } from '../../env.js';
import { ForumModule } from '../forum/forum.module.js';
import { AdminForumController } from './admin-forum.controller.js';
import { AdminForumService } from './admin-forum.service.js';
import { AdminMetricsController } from './admin-metrics.controller.js';
import { AdminMetricsService } from './admin-metrics.service.js';
import { AdminTd2Controller } from './admin-td2.controller.js';
import { AdminTd2Service } from './admin-td2.service.js';
import { MetricsReporterService } from './metrics-reporter.service.js';

/** La page d'administration des propriétaires du bot, et les relevés de l'API (Métriques). */
@Module({
  imports: [ForumModule],
  controllers: [AdminTd2Controller, AdminForumController, AdminMetricsController],
  providers: [
    AdminTd2Service,
    AdminForumService,
    AdminMetricsService,
    MetricsReporterService,
    OwnerGuard,
    // Le client S3 est créé une fois ; les tests le remplacent par un faux
    { provide: EVIDENCE, inject: [ENV], useFactory: (env: Env) => createEvidenceStorage(env) },
  ],
})
export class AdminModule {}
