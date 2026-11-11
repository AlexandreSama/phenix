import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  forumCategoryInputSchema,
  forumRoleInputSchema,
  forumUserQuerySchema,
  snowflakeSchema,
  type ForumCategoryData,
  type ForumCategorySummary,
  type ForumMember,
  type ForumRoleInput,
  type ForumUserQuery,
} from '@phenix/shared';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { OwnerGuard } from '../../common/guards/owner.guard.js';
import { AdminForumService } from './admin-forum.service.js';

const Id = new ParseIntPipe({ exceptionFactory: () => new NotFoundException('Introuvable') });

/** Un ID Discord dans l'adresse ; autre chose n'est pas un membre. */
const memberId = (value: string): string => {
  if (!snowflakeSchema.safeParse(value).success) throw new NotFoundException('Membre introuvable');
  return value;
};

/** Les catégories du forum et son équipe : réservé aux propriétaires du bot. */
@Controller('admin/forum')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminForumController {
  constructor(private readonly admin: AdminForumService) {}

  @Get('categories')
  categories(): Promise<ForumCategorySummary[]> {
    return this.admin.categories();
  }

  @Post('categories')
  createCategory(
    @Body({ schema: forumCategoryInputSchema }) input: ForumCategoryData,
  ): Promise<ForumCategorySummary[]> {
    return this.admin.createCategory(input);
  }

  @Put('categories/:id')
  updateCategory(
    @Param('id', Id) id: number,
    @Body({ schema: forumCategoryInputSchema }) input: ForumCategoryData,
  ): Promise<ForumCategorySummary[]> {
    return this.admin.updateCategory(id, input);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id', Id) id: number): Promise<ForumCategorySummary[]> {
    return this.admin.deleteCategory(id);
  }

  @Get('staff')
  staff(): Promise<ForumMember[]> {
    return this.admin.staff();
  }

  @Get('members')
  searchMembers(
    @Query({ schema: forumUserQuerySchema }) { q }: ForumUserQuery,
  ): Promise<ForumMember[]> {
    return this.admin.searchMembers(q);
  }

  @Put('members/:id/role')
  setRole(
    @Param('id') id: string,
    @Body({ schema: forumRoleInputSchema }) { role }: ForumRoleInput,
  ): Promise<ForumMember[]> {
    return this.admin.setRole(memberId(id), role);
  }
}
