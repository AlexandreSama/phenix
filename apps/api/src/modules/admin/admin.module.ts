import { Module } from '@nestjs/common';
import { createEvidenceStorage } from '@phenix/storage';
import { OwnerGuard } from '../../common/guards/owner.guard.js';
import { ENV, EVIDENCE } from '../../core/tokens.js';
import type { Env } from '../../env.js';
import { AdminTd2Controller } from './admin-td2.controller.js';
import { AdminTd2Service } from './admin-td2.service.js';
import { AdminForumService } from './admin-forum.service.js';
import { ForumModule } from '../forum/forum.module.js';
import { AdminForumController } from './admin-forum.controller.js';

/** La page d'administration des propriétaires du bot. */
@Module({
  imports: [ForumModule],
  controllers: [AdminTd2Controller, AdminForumController],
  providers: [
    AdminTd2Service,
    AdminForumService,
    // Le client S3 est créé une fois ; les tests le remplacent par un faux
    { provide: EVIDENCE, inject: [ENV], useFactory: (env: Env) => createEvidenceStorage(env) },
  ],
})
export class AdminModule {}
