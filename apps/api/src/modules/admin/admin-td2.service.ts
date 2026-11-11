import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  createTd2Activity,
  createTd2Directive,
  createTd2Mode,
  deleteTd2Directive,
  deleteTd2Mode,
  deleteTd2Report,
  findTd2Report,
  listTd2Catalogue,
  listTd2Directives,
  listTd2ReportsForAdmin,
  PrismaClient,
  updateTd2Activity,
  updateTd2Directive,
  updateTd2Mode,
  type CatalogueWrite,
} from '@phenix/database';
import {
  TD2_DIRECTIVE_LIMITS,
  TD2_EVIDENCE_LIMITS,
  type Td2ActivityInput,
  type Td2ActivityPatch,
  type Td2CatalogueActivity,
  type Td2Directive,
  type Td2DirectiveInput,
  type Td2DirectivePatch,
  type Td2ModeInput,
  type Td2ReportAdminPage,
  type Td2ReportQuery,
} from '@phenix/shared';
import type { ObjectStorage } from '@phenix/storage';
import { BotEventsService } from '../../core/bot-events.service.js';
import { EVIDENCE } from '../../core/tokens.js';

/** Traduit le résultat d'une écriture du catalogue en réponse HTTP. */
function check(result: CatalogueWrite, missing: string): void {
  if (result.status === 'missing') throw new NotFoundException(missing);
  if (result.status === 'duplicate') throw new ConflictException('Ce nom est déjà pris');
}

/** Une capture servie au navigateur : ses octets et un type d'image sûr. */
export interface Evidence {
  body: Uint8Array;
  contentType: string;
}

@Injectable()
export class AdminTd2Service {
  private readonly logger = new Logger(AdminTd2Service.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly botEvents: BotEventsService,
    @Inject(EVIDENCE) private readonly evidence: ObjectStorage,
  ) {}

  catalogue(): Promise<Td2CatalogueActivity[]> {
    return listTd2Catalogue(this.db);
  }

  async createActivity(input: Td2ActivityInput): Promise<Td2CatalogueActivity[]> {
    check(await createTd2Activity(this.db, input), 'Activité introuvable');
    return this.catalogue();
  }

  async updateActivity(id: number, patch: Td2ActivityPatch): Promise<Td2CatalogueActivity[]> {
    check(await updateTd2Activity(this.db, id, patch), 'Activité introuvable');
    return this.catalogue();
  }

  async createMode(activityId: number, input: Td2ModeInput): Promise<Td2CatalogueActivity[]> {
    check(await createTd2Mode(this.db, activityId, input), 'Activité introuvable');
    return this.catalogue();
  }

  async updateMode(modeId: number, input: Td2ModeInput): Promise<Td2CatalogueActivity[]> {
    check(await updateTd2Mode(this.db, modeId, input), 'Mode introuvable');
    return this.catalogue();
  }

  async deleteMode(modeId: number): Promise<Td2CatalogueActivity[]> {
    const result = await deleteTd2Mode(this.db, modeId);
    if (result.status === 'missing') throw new NotFoundException('Mode introuvable');
    if (result.status === 'in-use') {
      throw new ConflictException(
        `Ce mode a servi à ${result.events} sortie${result.events > 1 ? 's' : ''} : ` +
          'désactive plutôt son activité.',
      );
    }
    return this.catalogue();
  }

  // ---------- Directives des missions ----------

  directives(): Promise<Td2Directive[]> {
    return listTd2Directives(this.db);
  }

  /** Le menu du bot ne prend que 25 choix : au-delà, une directive de plus ne s'active pas. */
  private async assertActiveRoom(): Promise<void> {
    const active = await this.db.td2Directive.count({ where: { active: true } });
    if (active >= TD2_DIRECTIVE_LIMITS.maxActive) {
      throw new ConflictException(
        `${TD2_DIRECTIVE_LIMITS.maxActive} directives actives au plus : le menu de Discord n’en prend pas davantage. Désactives-en une d’abord.`,
      );
    }
  }

  async createDirective(input: Td2DirectiveInput): Promise<Td2Directive[]> {
    await this.assertActiveRoom();
    check(
      await createTd2Directive(this.db, {
        name: input.name,
        description: input.description ?? null,
      }),
      'Directive introuvable',
    );
    return this.directives();
  }

  async updateDirective(id: number, patch: Td2DirectivePatch): Promise<Td2Directive[]> {
    if (patch.active) {
      const current = await this.db.td2Directive.findUnique({ where: { id } });
      if (current && !current.active) await this.assertActiveRoom();
    }
    check(await updateTd2Directive(this.db, id, patch), 'Directive introuvable');
    return this.directives();
  }

  async deleteDirective(id: number): Promise<Td2Directive[]> {
    if (!(await deleteTd2Directive(this.db, id))) {
      throw new NotFoundException('Directive introuvable');
    }
    return this.directives();
  }

  async reports(query: Td2ReportQuery): Promise<Td2ReportAdminPage> {
    const { reports, nextCursor } = await listTd2ReportsForAdmin(this.db, query);
    return {
      reports: reports.map((report) => ({
        id: report.id,
        guildId: report.guildId,
        guildName: report.guild.name,
        playerName: report.playerName,
        platform: report.platform,
        reason: report.reason as Td2ReportAdminPage['reports'][number]['reason'],
        details: report.details,
        status: report.status,
        evidenceCount: report.evidenceKeys.length,
        createdAt: report.createdAt.toISOString(),
        reviewedAt: report.reviewedAt?.toISOString() ?? null,
      })),
      nextCursor,
    };
  }

  /** Une capture d'un signalement, lue dans le bucket des preuves. */
  async evidenceFile(reportId: number, index: number): Promise<Evidence> {
    const report = await findTd2Report(this.db, reportId);
    const key = report?.evidenceKeys.at(index);
    if (!key || index < 0) throw new NotFoundException('Capture introuvable');
    const object = await this.evidence.getBytes(key);
    if (!object) throw new NotFoundException('Capture introuvable');
    // Seuls les types d'image attendus sont servis comme tels ; le reste se télécharge
    const contentType = (TD2_EVIDENCE_LIMITS.contentTypes as readonly string[]).includes(
      object.contentType ?? '',
    )
      ? (object.contentType as string)
      : 'application/octet-stream';
    return { body: object.body, contentType };
  }

  /**
   * Supprime un signalement, puis ses captures, puis son embed chez le staff d'origine.
   * La base passe d'abord : une capture qui resterait dans le bucket n'est plus reliée à rien.
   */
  async deleteReport(id: number): Promise<void> {
    const report = await deleteTd2Report(this.db, id);
    if (!report) throw new NotFoundException('Signalement introuvable');
    await this.evidence.delete(report.evidenceKeys).catch((err: unknown) => {
      this.logger.warn(`Captures du signalement #${id} non supprimées : ${String(err)}`);
    });
    if (report.staffMessageId) {
      await this.botEvents.notify({
        type: 'td2Report.deleted',
        guildId: report.guildId,
        messageId: report.staffMessageId,
      });
    }
  }
}
