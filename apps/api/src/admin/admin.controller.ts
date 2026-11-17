import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators';
import {
  CreateBrandDto,
  UpdateBrandDto,
  BrandSuggestionDto,
} from '../brands/brands.dto';
import {
  AdminReviewQueueQueryDto,
  AdminUsersQueryDto,
  AuditLogQueryDto,
  ModerateReviewDto,
  ResolveSuggestionDto,
  SetRoleDto,
  SuspendUserDto,
} from './admin.dto';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';

/**
 * Permissions (PRD §8.1). Class default: MODERATOR or ADMIN.
 * Routes marked @Roles(ADMIN) are admin-only (method metadata overrides the class).
 */
@ApiTags('Admin (JWT + MODERATOR/ADMIN role)')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller()
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
export class AdminController {
  constructor(private admin: AdminService) {}

  @ApiOperation({ summary: 'GET /admin/dashboard — Queue counts (moderator+)' })
  @Get('admin/dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @ApiOperation({ summary: 'GET /admin/brands — List all brands (moderator+)' })
  @Get('admin/brands')
  listBrands() {
    return this.admin.listBrands();
  }

  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'POST /admin/brands — Create brand (admin)' })
  @ApiBody({ type: CreateBrandDto })
  @Post('admin/brands')
  createBrand(@CurrentUser() actor: AuthUser, @Body() dto: CreateBrandDto) {
    return this.admin.createBrand(actor, dto);
  }

  @ApiOperation({
    summary: 'PATCH /admin/brands/{id} — Update brand (moderator+)',
    description:
      'Set claimed:true ONLY after verifying the business. Every change is audit-logged.',
  })
  @ApiBody({ type: UpdateBrandDto })
  @Patch('admin/brands/:id')
  updateBrand(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.admin.updateBrand(actor, id, dto);
  }

  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'DELETE /admin/brands/{id} — Deactivate brand (admin)',
  })
  @Delete('admin/brands/:id')
  deactivateBrand(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.admin.deactivateBrand(actor, id);
  }

  @ApiOperation({
    summary:
      'GET /admin/reviews/queue — Moderation queue, oldest first (moderator+)',
    description:
      'Query queue=flagged|reported|pending_receipt|suspended. Receipt URLs are signed private links.',
  })
  @Get('admin/reviews/queue')
  reviewQueue(@Query() query: AdminReviewQueueQueryDto) {
    return this.admin.reviewQueue(query.queue ?? 'flagged');
  }

  @ApiOperation({
    summary: 'GET /admin/reviews/{id}/revisions — Edit history (moderator+)',
  })
  @Get('admin/reviews/:id/revisions')
  reviewRevisions(@Param('id') id: string) {
    return this.admin.reviewRevisions(id);
  }

  @ApiOperation({
    summary:
      'PATCH /admin/reviews/{id} — Moderate review (moderator+, audit-logged)',
  })
  @ApiBody({ type: ModerateReviewDto })
  @Patch('admin/reviews/:id')
  moderateReview(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.admin.moderateReview(
      actor,
      id,
      dto.action,
      dto.note,
      dto.approved,
    );
  }

  @ApiOperation({
    summary:
      'GET /admin/suggestions — Pending suggestions with possibleDuplicates (moderator+)',
  })
  @Get('admin/suggestions')
  listSuggestions() {
    return this.admin.listSuggestions();
  }

  @ApiOperation({
    summary: 'PATCH /admin/suggestions/{id} — Approve or reject (moderator+)',
  })
  @ApiBody({ type: ResolveSuggestionDto })
  @Patch('admin/suggestions/:id')
  resolveSuggestion(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveSuggestionDto,
  ) {
    return this.admin.resolveSuggestion(actor, id, dto.status, dto.adminNote);
  }

  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'GET /admin/users — Search users (admin)' })
  @Get('admin/users')
  listUsers(@Query() query: AdminUsersQueryDto) {
    return this.admin.listUsers({
      q: query.q,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'PATCH /admin/users/{id}/suspend — Suspend/unsuspend user (admin)',
  })
  @ApiBody({ type: SuspendUserDto })
  @Patch('admin/users/:id/suspend')
  suspendUser(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.admin.suspendUser(actor, id, dto.suspended, dto.reason);
  }

  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'PATCH /admin/users/{id}/role — Set USER / MODERATOR / ADMIN (admin)',
  })
  @ApiBody({ type: SetRoleDto })
  @Patch('admin/users/:id/role')
  setRole(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.admin.setRole(actor, id, dto.role as UserRole);
  }

  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'GET /admin/audit-logs — Audit trail, newest first (admin)',
  })
  @Get('admin/audit-logs')
  auditLogs(@Query() query: AuditLogQueryDto) {
    return this.admin.listAuditLogs({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      targetType: query.targetType,
      targetId: query.targetId,
      actorId: query.actorId,
    });
  }
}

@ApiTags('Brand suggestions')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('brand-suggestions')
export class BrandSuggestionsController {
  constructor(private admin: AdminService) {}

  @ApiOperation({
    summary: 'POST /brand-suggestions — Suggest a missing brand (JWT)',
    description:
      'Response includes possibleDuplicates so the UI can ask "Did you mean…?".',
  })
  @ApiBody({ type: BrandSuggestionDto })
  @Post()
  suggest(
    @CurrentUser() user: { id: string },
    @Body() dto: BrandSuggestionDto,
  ) {
    return this.admin.suggestBrand(user.id, dto);
  }
}
