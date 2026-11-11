import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { deleteOrphanForumImage, listOrphanForumImages, PrismaClient } from '@phenix/database';
import type { ObjectStorage } from '@phenix/storage';
import { MEDIA } from '../../core/tokens.js';

const HOUR = 3600_000;
/** Le temps d'écrire un message : une image envoyée mais jamais publiée attend un jour. */
export const ORPHAN_GRACE_MS = 24 * HOUR;

/**
 * Le ménage des images orphelines : envoyées puis jamais publiées, ou retirées d'un message
 * modifié. Une fois par heure, sans file ni planificateur : refaire le ménage deux fois ne
 * casse rien, donc plusieurs instances de l'API peuvent le faire chacune de leur côté.
 */
@Injectable()
export class ForumCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ForumCleanupService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: PrismaClient,
    @Inject(MEDIA) private readonly media: ObjectStorage,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.sweep().catch((err: unknown) => this.logger.warn(`Ménage des images : ${String(err)}`));
    }, HOUR);
    // Le minuteur ne retient pas le processus à l'arrêt
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Supprime les orphelines plus vieilles qu'un jour. Rend leur nombre. */
  async sweep(now = new Date()): Promise<number> {
    const orphans = await listOrphanForumImages(this.db, new Date(now.getTime() - ORPHAN_GRACE_MS));
    let removed = 0;
    for (const orphan of orphans) {
      // La ligne d'abord : si un message vient de la citer, on ne touche pas au fichier
      if (!(await deleteOrphanForumImage(this.db, orphan.id))) continue;
      await this.media.delete([orphan.key]);
      removed += 1;
    }
    if (removed > 0) this.logger.log(`${removed} image(s) orpheline(s) supprimée(s)`);
    return removed;
  }
}
