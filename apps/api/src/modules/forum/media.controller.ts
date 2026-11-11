import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ForumService } from './forum.service.js';

/**
 * Une image ne change jamais (une modification crée une nouvelle image) : le navigateur et un
 * éventuel cache la gardent un an. nosniff et le bac à sable empêchent tout autre usage.
 */
export const MEDIA_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
} as const;

const Uuid = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Introuvable') });

/** Les images du forum, publiques comme lui : /api/media/<id>. */
@Controller('media')
export class MediaController {
  constructor(private readonly forum: ForumService) {}

  @Get(':id')
  async image(
    @Param('id', Uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.forum.mediaFile(id);
    res.set(MEDIA_HEADERS);
    return new StreamableFile(Buffer.from(file.body), {
      type: file.contentType ?? 'image/webp',
      disposition: 'inline',
    });
  }
}
