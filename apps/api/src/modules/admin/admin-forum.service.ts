import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  createForumCategory,
  deleteForumCategory,
  listForumStaff,
  PrismaClient,
  searchForumMembers,
  setForumRole,
  updateForumCategory,
  type ForumCategoryResult,
  type UserRole,
} from '@phenix/database';
import type { ForumCategoryData, ForumCategorySummary, ForumMember } from '@phenix/shared';
import { avatarUrl } from '../auth/auth.service.js';
import { ForumService } from '../forum/forum.service.js';

const toMember = (user: {
  id: string;
  username: string;
  avatar: string | null;
  role: UserRole;
}): ForumMember => ({
  id: user.id,
  username: user.username,
  avatarUrl: avatarUrl(user.id, user.avatar),
  role: user.role,
});

/** Les catégories et l'équipe du forum, gérées par les propriétaires du bot. */
@Injectable()
export class AdminForumService {
  constructor(
    private readonly db: PrismaClient,
    private readonly forum: ForumService,
  ) {}

  categories(): Promise<ForumCategorySummary[]> {
    return this.forum.categories();
  }

  private async check(result: ForumCategoryResult): Promise<ForumCategorySummary[]> {
    if (result.status === 'missing') throw new NotFoundException('Catégorie introuvable');
    if (result.status === 'duplicate') throw new ConflictException('Ce slug est déjà pris');
    return this.categories();
  }

  async createCategory(input: ForumCategoryData): Promise<ForumCategorySummary[]> {
    return this.check(await createForumCategory(this.db, input));
  }

  async updateCategory(id: number, input: ForumCategoryData): Promise<ForumCategorySummary[]> {
    return this.check(await updateForumCategory(this.db, id, input));
  }

  async deleteCategory(id: number): Promise<ForumCategorySummary[]> {
    const result = await deleteForumCategory(this.db, id);
    if (result.status === 'missing') throw new NotFoundException('Catégorie introuvable');
    if (result.status === 'in-use') {
      throw new ConflictException(
        `La catégorie contient ${result.threads} sujet${result.threads > 1 ? 's' : ''} : supprime-les d’abord.`,
      );
    }
    return this.categories();
  }

  async staff(): Promise<ForumMember[]> {
    return (await listForumStaff(this.db)).map(toMember);
  }

  async searchMembers(query: string): Promise<ForumMember[]> {
    return (await searchForumMembers(this.db, query)).map(toMember);
  }

  async setRole(userId: string, role: UserRole): Promise<ForumMember[]> {
    if (!(await setForumRole(this.db, userId, role))) {
      throw new NotFoundException('Ce membre ne s’est jamais connecté au site.');
    }
    return this.staff();
  }
}
