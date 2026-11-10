import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  td2ActivityInputSchema,
  td2ActivityPatchSchema,
  td2ModeInputSchema,
  td2ReportQuerySchema,
  type Td2ActivityInput,
  type Td2ActivityPatch,
  type Td2CatalogueActivity,
  type Td2ModeInput,
  type Td2ReportAdminPage,
  type Td2ReportQuery,
} from '@phenix/shared';
import type { Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { OwnerGuard } from '../../common/guards/owner.guard.js';
import { AdminTd2Service } from './admin-td2.service.js';

const Id = new ParseIntPipe({ exceptionFactory: () => new NotFoundException('Introuvable') });

/**
 * Une capture envoyée par un membre : servie comme une image, jamais interprétée comme une
 * page (nosniff), sans script possible même ouverte seule (CSP + sandbox).
 */
export const EVIDENCE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cache-Control': 'private, max-age=300',
} as const;

/** Le catalogue TD2 et les signalements du réseau : réservé aux propriétaires du bot. */
@Controller('admin/td2')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminTd2Controller {
  constructor(private readonly admin: AdminTd2Service) {}

  @Get('catalogue')
  catalogue(): Promise<Td2CatalogueActivity[]> {
    return this.admin.catalogue();
  }

  @Post('activities')
  createActivity(
    @Body({ schema: td2ActivityInputSchema }) input: Td2ActivityInput,
  ): Promise<Td2CatalogueActivity[]> {
    return this.admin.createActivity(input);
  }

  @Patch('activities/:id')
  updateActivity(
    @Param('id', Id) id: number,
    @Body({ schema: td2ActivityPatchSchema }) patch: Td2ActivityPatch,
  ): Promise<Td2CatalogueActivity[]> {
    return this.admin.updateActivity(id, patch);
  }

  @Post('activities/:id/modes')
  createMode(
    @Param('id', Id) activityId: number,
    @Body({ schema: td2ModeInputSchema }) input: Td2ModeInput,
  ): Promise<Td2CatalogueActivity[]> {
    return this.admin.createMode(activityId, input);
  }

  @Put('modes/:id')
  updateMode(
    @Param('id', Id) modeId: number,
    @Body({ schema: td2ModeInputSchema }) input: Td2ModeInput,
  ): Promise<Td2CatalogueActivity[]> {
    return this.admin.updateMode(modeId, input);
  }

  @Delete('modes/:id')
  deleteMode(@Param('id', Id) modeId: number): Promise<Td2CatalogueActivity[]> {
    return this.admin.deleteMode(modeId);
  }

  @Get('reports')
  reports(
    @Query({ schema: td2ReportQuerySchema }) query: Td2ReportQuery,
  ): Promise<Td2ReportAdminPage> {
    return this.admin.reports(query);
  }

  @Get('reports/:id/evidence/:index')
  async evidence(
    @Param('id', Id) id: number,
    @Param('index', Id) index: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.admin.evidenceFile(id, index);
    // Posés après la lecture : une erreur 404 garde ses en-têtes JSON habituels
    res.set(EVIDENCE_HEADERS);
    return new StreamableFile(Buffer.from(file.body), {
      type: file.contentType,
      disposition: file.contentType.startsWith('image/') ? 'inline' : 'attachment',
    });
  }

  @Delete('reports/:id')
  @HttpCode(204)
  deleteReport(@Param('id', Id) id: number): Promise<void> {
    return this.admin.deleteReport(id);
  }
}
