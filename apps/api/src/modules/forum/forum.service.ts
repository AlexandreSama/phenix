import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createForumImage,
  createForumReply,
  createForumThread,
  deleteForumPost,
  deleteForumThread,
  findForumCategory,
  findForumImage,
  findForumPost,
  findForumThread,
  firstForumPostId,
  listForumCategories,
  listForumPosts,
  listForumThreads,
  moderateForumThread,
  PrismaClient,
  updateForumPost,
  type UserRole,
} from '@phenix/database';
import {
  FORUM_LIMITS,
  forumImageIds,
  forumImageUrl,
  type ForumAuthor,
  type ForumCategoryPage,
  type ForumCategorySummary,
  type ForumImage,
  type ForumPostCreated,
  type ForumPostInput,
  type ForumThreadInput,
  type ForumThreadModeration,
  type ForumThreadView,
} from '@phenix/shared';
import type { ObjectStorage, StoredObject } from '@phenix/storage';
import { ENV, MEDIA } from '../../core/tokens.js';
import { RateLimitService } from '../../core/rate-limit.service.js';
import type { Env } from '../../env.js';
import { avatarUrl } from '../auth/auth.service.js';
import { canDeletePost, canEditPost, canModerate, canReply, type ForumViewer } from './access.js';
import { ImageRejectedError, processForumImage } from './images.js';
import { renderForumMarkdown } from './markdown.js';

/** Les limites de débit, par compte. */
export const FORUM_RATES = {
  posts: { limit: 6, windowSeconds: 60, message: 'Doucement : 6 messages par minute au plus.' },
  threads: {
    limit: 5,
    windowSeconds: 3600,
    message: 'Tu as ouvert 5 sujets dans l’heure : attends un peu avant le suivant.',
  },
  images: {
    limit: 20,
    windowSeconds: 3600,
    message: 'Tu as envoyé 20 images dans l’heure : attends un peu avant la suivante.',
  },
  previews: {
    limit: 30,
    windowSeconds: 60,
    message: 'Trop d’aperçus d’affilée : patiente un peu.',
  },
} as const;

interface AuthorRow {
  id: string;
  username: string;
  avatar: string | null;
  role: UserRole;
}

const toAuthor = (user: AuthorRow): ForumAuthor => ({
  id: user.id,
  username: user.username,
  avatarUrl: avatarUrl(user.id, user.avatar),
  role: user.role,
});

const pageCount = (total: number, perPage: number) => Math.max(1, Math.ceil(total / perPage));

@Injectable()
export class ForumService {
  private readonly logger = new Logger(ForumService.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly rateLimit: RateLimitService,
    @Inject(ENV) private readonly env: Env,
    @Inject(MEDIA) private readonly media: ObjectStorage,
  ) {}

  /** Qui regarde : son rôle sur le forum, ou null pour un visiteur. */
  async viewer(userId: string | undefined): Promise<ForumViewer | null> {
    if (!userId) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) return null;
    return { id: user.id, role: user.role, isOwner: this.env.BOT_OWNER_IDS.includes(user.id) };
  }

  /** Pour écrire : une session valide dont l'utilisateur existe encore. */
  async requireViewer(userId: string): Promise<ForumViewer> {
    const viewer = await this.viewer(userId);
    if (!viewer) throw new UnauthorizedException('Connexion requise');
    return viewer;
  }

  async categories(): Promise<ForumCategorySummary[]> {
    const categories = await listForumCategories(this.db);
    return categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      position: category.position,
      threadCount: category.threadCount,
      lastActivityAt: category.lastActivityAt?.toISOString() ?? null,
    }));
  }

  async categoryPage(
    slug: string,
    page: number,
    viewer: ForumViewer | null,
  ): Promise<ForumCategoryPage> {
    const category = await findForumCategory(this.db, slug);
    if (!category) throw new NotFoundException('Catégorie introuvable');
    const take = FORUM_LIMITS.threadsPerPage;
    const { threads, total } = await listForumThreads(this.db, {
      categoryId: category.id,
      page,
      take,
    });
    return {
      category: {
        id: category.id,
        slug: category.slug,
        name: category.name,
        description: category.description,
      },
      threads: threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        pinned: thread.pinned,
        locked: thread.locked,
        author: toAuthor(thread.author),
        replyCount: Math.max(0, thread._count.posts - 1),
        createdAt: thread.createdAt.toISOString(),
        lastActivityAt: thread.updatedAt.toISOString(),
      })),
      page,
      pageCount: pageCount(total, take),
      canPost: viewer !== null,
    };
  }

  async thread(id: number, page: number, viewer: ForumViewer | null): Promise<ForumThreadView> {
    const thread = await findForumThread(this.db, id);
    if (!thread) throw new NotFoundException('Sujet introuvable');
    const take = FORUM_LIMITS.postsPerPage;
    const [{ posts, total }, firstId] = await Promise.all([
      listForumPosts(this.db, { threadId: id, page, take }),
      firstForumPostId(this.db, id),
    ]);
    if (posts.length === 0 && page > 1) throw new NotFoundException('Cette page n’existe pas');

    return {
      id: thread.id,
      title: thread.title,
      pinned: thread.pinned,
      locked: thread.locked,
      category: { slug: thread.category.slug, name: thread.category.name },
      posts: posts.map((post) => ({
        id: post.id,
        author: toAuthor(post.author),
        content: post.content,
        html: renderForumMarkdown(post.content),
        createdAt: post.createdAt.toISOString(),
        editedAt: post.editedAt?.toISOString() ?? null,
        canEdit: canEditPost(viewer, post.authorId),
        canDelete: canDeletePost(viewer, post.authorId, post.id === firstId),
      })),
      page,
      pageCount: pageCount(total, take),
      canReply: canReply(viewer, thread.locked),
      canModerate: canModerate(viewer),
    };
  }

  private async limit(viewer: ForumViewer, kind: keyof typeof FORUM_RATES): Promise<void> {
    const rate = FORUM_RATES[kind];
    await this.rateLimit.hit(
      `forum:${kind}:${viewer.id}`,
      rate.limit,
      rate.windowSeconds,
      rate.message,
    );
  }

  async createThread(viewer: ForumViewer, input: ForumThreadInput): Promise<ForumPostCreated> {
    await this.limit(viewer, 'threads');
    await this.limit(viewer, 'posts');
    const created = await createForumThread(this.db, {
      ...input,
      authorId: viewer.id,
      imageIds: forumImageIds(input.content),
    });
    if (!created) throw new BadRequestException('Catégorie inconnue');
    return { ...created, page: 1 };
  }

  async reply(
    viewer: ForumViewer,
    threadId: number,
    { content }: ForumPostInput,
  ): Promise<ForumPostCreated> {
    await this.limit(viewer, 'posts');
    const result = await createForumReply(this.db, {
      threadId,
      authorId: viewer.id,
      content,
      imageIds: forumImageIds(content),
      bypassLock: canModerate(viewer),
    });
    if (result.status === 'missing') throw new NotFoundException('Sujet introuvable');
    if (result.status === 'locked') {
      throw new ForbiddenException('Ce sujet est verrouillé : plus de réponse possible.');
    }
    return {
      threadId,
      postId: result.postId,
      page: Math.ceil(result.position / FORUM_LIMITS.postsPerPage),
    };
  }

  async editPost(viewer: ForumViewer, postId: number, { content }: ForumPostInput): Promise<void> {
    const post = await findForumPost(this.db, postId);
    if (!post) throw new NotFoundException('Message introuvable');
    if (!canEditPost(viewer, post.authorId)) {
      throw new ForbiddenException('Tu ne peux modifier que tes propres messages.');
    }
    if (post.thread.locked && !canModerate(viewer)) {
      throw new ForbiddenException('Ce sujet est verrouillé.');
    }
    await updateForumPost(this.db, {
      postId,
      editorId: viewer.id,
      content,
      imageIds: forumImageIds(content),
    });
  }

  async deletePost(viewer: ForumViewer, postId: number): Promise<void> {
    const post = await findForumPost(this.db, postId);
    if (!post) throw new NotFoundException('Message introuvable');
    const isFirst = (await firstForumPostId(this.db, post.thread.id)) === post.id;
    if (isFirst) {
      throw new BadRequestException('Le premier message ne se supprime qu’avec le sujet.');
    }
    if (!canDeletePost(viewer, post.authorId, isFirst)) {
      throw new ForbiddenException('Tu ne peux supprimer que tes propres messages.');
    }
    await this.removeImages(await deleteForumPost(this.db, postId));
  }

  async moderate(viewer: ForumViewer, threadId: number, patch: ForumThreadModeration) {
    if (!canModerate(viewer)) throw new ForbiddenException('Réservé à la modération du forum.');
    if (!(await moderateForumThread(this.db, threadId, patch))) {
      throw new NotFoundException('Sujet introuvable');
    }
  }

  async deleteThread(viewer: ForumViewer, threadId: number): Promise<{ categorySlug: string }> {
    if (!canModerate(viewer)) throw new ForbiddenException('Réservé à la modération du forum.');
    const thread = await findForumThread(this.db, threadId);
    if (!thread) throw new NotFoundException('Sujet introuvable');
    await this.removeImages(await deleteForumThread(this.db, threadId));
    return { categorySlug: thread.category.slug };
  }

  /** Les fichiers d'images supprimées. Un échec ne bloque pas : le message est déjà parti. */
  private async removeImages(keys: string[] | null): Promise<void> {
    if (!keys?.length) return;
    await this.media.delete(keys).catch((err: unknown) => {
      this.logger.warn({ err, keys }, 'Images du forum non supprimées du bucket');
    });
  }

  async preview(viewer: ForumViewer, { content }: ForumPostInput): Promise<{ html: string }> {
    await this.limit(viewer, 'previews');
    return { html: renderForumMarkdown(content) };
  }

  async uploadImage(viewer: ForumViewer, file: Buffer | undefined): Promise<ForumImage> {
    if (!file?.length) throw new BadRequestException('Aucune image reçue.');
    await this.limit(viewer, 'images');
    let image;
    try {
      image = await processForumImage(file);
    } catch (err) {
      if (err instanceof ImageRejectedError) throw new BadRequestException(err.message);
      throw err;
    }

    const id = randomUUID();
    const key = `forum/${id}.webp`;
    // La ligne d'abord : si l'envoi au bucket échoue, le ménage la retrouvera ; l'inverse
    // laisserait un fichier que plus rien ne référence
    await createForumImage(this.db, {
      id,
      uploaderId: viewer.id,
      key,
      sizeBytes: image.data.length,
      width: image.width,
      height: image.height,
    });
    await this.media.put(key, image.data, 'image/webp');
    return { id, url: forumImageUrl(id), width: image.width, height: image.height };
  }

  async mediaFile(id: string): Promise<StoredObject> {
    const image = await findForumImage(this.db, id);
    const file = image && (await this.media.getBytes(image.key));
    if (!file) throw new NotFoundException('Image introuvable');
    return file;
  }
}
