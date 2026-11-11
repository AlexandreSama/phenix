import { Module } from '@nestjs/common';
import { createMediaStorage } from '@phenix/storage';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard.js';
import { ENV, MEDIA } from '../../core/tokens.js';
import type { Env } from '../../env.js';
import { ForumCleanupService } from './forum-cleanup.service.js';
import { ForumController } from './forum.controller.js';
import { ForumService } from './forum.service.js';
import { MediaController } from './media.controller.js';

/** Le forum du site : catégories, sujets, messages, images. */
@Module({
  controllers: [ForumController, MediaController],
  providers: [
    ForumService,
    ForumCleanupService,
    OptionalAuthGuard,
    { provide: MEDIA, inject: [ENV], useFactory: (env: Env) => createMediaStorage(env) },
  ],
  exports: [ForumService],
})
export class ForumModule {}
