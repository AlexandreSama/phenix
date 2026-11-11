import {
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  FORUM_LIMITS,
  forumPageQuerySchema,
  forumPostInputSchema,
  forumThreadInputSchema,
  forumThreadModerationSchema,
  type ForumCategoryPage,
  type ForumCategorySummary,
  type ForumImage,
  type ForumMarkdownPreview,
  type ForumPageQuery,
  type ForumPostCreated,
  type ForumPostInput,
  type ForumThreadInput,
  type ForumThreadModeration,
  type ForumThreadView,
} from '@phenix/shared';
import type { Response } from 'express';
import { CurrentSession } from '../../common/decorators/current-session.decorator.js';
import { ViewerSession } from '../../common/decorators/viewer-session.decorator.js';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard.js';
import type { Session } from '../auth/session.service.js';
import { ForumService } from './forum.service.js';

const Id = new ParseIntPipe({ exceptionFactory: () => new NotFoundException('Introuvable') });
const MAX_MB = FORUM_LIMITS.imageMaxBytes / (1024 * 1024);

/** Multer coupe l'envoi au-delà de la limite ; on remplace son message anglais. */
@Catch(PayloadTooLargeException)
class ImageTooLargeFilter implements ExceptionFilter {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(413)
      .json({ statusCode: 413, message: `Image trop lourde : ${MAX_MB} Mo au plus.` });
  }
}

/** Le forum : lecture publique, écriture pour les membres connectés. */
@Controller('forum')
export class ForumController {
  constructor(private readonly forum: ForumService) {}

  @Get('categories')
  categories(): Promise<ForumCategorySummary[]> {
    return this.forum.categories();
  }

  @Get('categories/:slug')
  @UseGuards(OptionalAuthGuard)
  async categoryPage(
    @Param('slug') slug: string,
    @Query({ schema: forumPageQuerySchema }) { page }: ForumPageQuery,
    @ViewerSession() session: Session | null,
  ): Promise<ForumCategoryPage> {
    return this.forum.categoryPage(slug, page, await this.forum.viewer(session?.userId));
  }

  @Get('threads/:id')
  @UseGuards(OptionalAuthGuard)
  async thread(
    @Param('id', Id) id: number,
    @Query({ schema: forumPageQuerySchema }) { page }: ForumPageQuery,
    @ViewerSession() session: Session | null,
  ): Promise<ForumThreadView> {
    return this.forum.thread(id, page, await this.forum.viewer(session?.userId));
  }

  @Post('threads')
  @UseGuards(AuthGuard)
  async createThread(
    @CurrentSession() session: Session,
    @Body({ schema: forumThreadInputSchema }) input: ForumThreadInput,
  ): Promise<ForumPostCreated> {
    return this.forum.createThread(await this.forum.requireViewer(session.userId), input);
  }

  @Post('threads/:id/posts')
  @UseGuards(AuthGuard)
  async reply(
    @CurrentSession() session: Session,
    @Param('id', Id) threadId: number,
    @Body({ schema: forumPostInputSchema }) input: ForumPostInput,
  ): Promise<ForumPostCreated> {
    return this.forum.reply(await this.forum.requireViewer(session.userId), threadId, input);
  }

  @Patch('threads/:id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async moderate(
    @CurrentSession() session: Session,
    @Param('id', Id) threadId: number,
    @Body({ schema: forumThreadModerationSchema }) patch: ForumThreadModeration,
  ): Promise<void> {
    await this.forum.moderate(await this.forum.requireViewer(session.userId), threadId, patch);
  }

  @Delete('threads/:id')
  @UseGuards(AuthGuard)
  async deleteThread(
    @CurrentSession() session: Session,
    @Param('id', Id) threadId: number,
  ): Promise<{ categorySlug: string }> {
    return this.forum.deleteThread(await this.forum.requireViewer(session.userId), threadId);
  }

  @Patch('posts/:id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async editPost(
    @CurrentSession() session: Session,
    @Param('id', Id) postId: number,
    @Body({ schema: forumPostInputSchema }) input: ForumPostInput,
  ): Promise<void> {
    await this.forum.editPost(await this.forum.requireViewer(session.userId), postId, input);
  }

  @Delete('posts/:id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async deletePost(
    @CurrentSession() session: Session,
    @Param('id', Id) postId: number,
  ): Promise<void> {
    await this.forum.deletePost(await this.forum.requireViewer(session.userId), postId);
  }

  /** L'aperçu du formulaire : le même rendu que le message publié. */
  @Post('preview')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async preview(
    @CurrentSession() session: Session,
    @Body({ schema: forumPostInputSchema }) input: ForumPostInput,
  ): Promise<ForumMarkdownPreview> {
    return this.forum.preview(await this.forum.requireViewer(session.userId), input);
  }

  /** Une image, envoyée en multipart dans le champ « image ». */
  @Post('images')
  @UseGuards(AuthGuard)
  @UseFilters(ImageTooLargeFilter)
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: FORUM_LIMITS.imageMaxBytes, files: 1 } }),
  )
  async uploadImage(
    @CurrentSession() session: Session,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<ForumImage> {
    return this.forum.uploadImage(await this.forum.requireViewer(session.userId), file?.buffer);
  }
}
