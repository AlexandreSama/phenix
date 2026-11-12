import { Injectable } from '@nestjs/common';
import {
  caseStatus,
  listGuildCases,
  PrismaClient,
  summarizeMemberCases,
  type Case,
} from '@phenix/database';
import {
  CASE_PAGE_SIZE,
  type CaseListQuery,
  type CasePage,
  type CaseSummary,
  type MemberModeration,
  type ResolvedUser,
} from '@phenix/shared';
import { UserDirectory } from './user-directory.js';

@Injectable()
export class ModerationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly users: UserDirectory,
  ) {}

  /** Les sanctions de ce serveur, filtrées, avec le nom de chaque personne concernée. */
  async list(guildId: string, query: CaseListQuery): Promise<CasePage> {
    const { page: number, ...filters } = query;
    const now = new Date();
    const slice = await listGuildCases(
      this.db,
      guildId,
      filters,
      { page: number, pageSize: CASE_PAGE_SIZE },
      now,
    );
    const people = await this.users.resolve(
      slice.items.flatMap((c) => [
        c.targetId,
        c.moderatorId,
        ...(c.revokedById ? [c.revokedById] : []),
      ]),
    );
    return {
      items: slice.items.map((c) => toSummary(c, people, now)),
      total: slice.total,
      page: slice.page,
      pageSize: slice.pageSize,
    };
  }

  /** L'en-tête de la fiche d'un membre : qui il est, combien de sanctions, ce qui est actif. */
  async member(guildId: string, userId: string): Promise<MemberModeration> {
    const summary = await summarizeMemberCases(this.db, guildId, userId);
    // Aucune sanction ici : rien à afficher de plus que l'identifiant, et surtout pas d'appel à
    // Discord pour un compte quelconque (ce serait un moyen de le surcharger, et de sonder des tiers)
    const people = summary.total > 0 ? await this.users.resolve([userId]) : new Map();
    return {
      user: person(people, userId),
      total: summary.total,
      byType: summary.byType,
      activeWarns: summary.activeWarns,
      activeMute: summary.activeMute && {
        number: summary.activeMute.number,
        expiresAt: summary.activeMute.expiresAt?.toISOString() ?? null,
      },
      activeBan: summary.activeBan,
    };
  }
}

const person = (people: Map<string, ResolvedUser>, id: string): ResolvedUser =>
  people.get(id) ?? { id, name: id, avatarUrl: null };

function toSummary(c: Case, people: Map<string, ResolvedUser>, now: Date): CaseSummary {
  return {
    number: c.number,
    type: c.type,
    status: caseStatus(c, now),
    target: person(people, c.targetId),
    moderator: person(people, c.moderatorId),
    reason: c.reason,
    createdAt: c.createdAt.toISOString(),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    revokedAt: c.revokedAt?.toISOString() ?? null,
    revokedBy: c.revokedById ? person(people, c.revokedById) : null,
  };
}
