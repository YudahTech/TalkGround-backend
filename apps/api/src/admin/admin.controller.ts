import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@prisma/client';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';
import { AuditService } from '../audit/audit.service';
import {
  AdminUpdateBusinessDto,
  CreateBusinessDto,
  IdentifierInputDto,
} from '../businesses/businesses.dto';
import { AdminService } from './admin.service';
import { ModerationAdminService } from './moderation-admin.service';
import {
  AdminBusinessQueryDto,
  AuditQueryDto,
  BusinessStatusDto,
  CreateCategoryDto,
  CreateDimensionDto,
  DecideDisputeDto,
  DecideReportDto,
  DisputeQueryDto,
  EvidenceDecisionDto,
  InvestigationDto,
  MergeBusinessDto,
  ModerateReviewDto,
  RemoveResponseDto,
  ReportQueryDto,
  ReviewQueueQueryDto,
  SetStaffRoleDto,
  SuspendUserDto,
  UpsertCategoryDto,
  UpsertDimensionDto,
  UserListQueryDto,
} from './admin.dto';

const uuid = new ParseUUIDPipe({ version: '4' });
const P = AdminPermission;

@ApiTags('Admin — overview & users')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('admin')
export class AdminUsersController {
  constructor(
    private admin: AdminService,
    private audit: AuditService,
  ) {}

  @RequirePermissions()
  @ApiOperation({ summary: 'Totals and work queues (any staff member)' })
  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @RequirePermissions(P.USERS_VIEW)
  @ApiOperation({ summary: 'Users (filter: all | suspended | staff)' })
  @Get('users')
  users(@Query() q: UserListQueryDto) {
    return this.admin.listUsers(q);
  }

  @RequirePermissions(P.USERS_VIEW)
  @ApiOperation({
    summary: 'User detail with recent reviews and managed businesses',
  })
  @Get('users/:id')
  user(@Param('id', uuid) id: string) {
    return this.admin.userDetail(id);
  }

  @RequirePermissions(P.USERS_RESTRICT)
  @ApiOperation({
    summary: 'Suspend / unsuspend (suspension signs the user out everywhere)',
  })
  @Patch('users/:id/suspension')
  suspend(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.admin.suspendUser(actor, id, dto.suspended, dto.reason);
  }

  @RequirePermissions(P.STAFF_MANAGE)
  @ApiOperation({ summary: 'Staff roles and their permissions' })
  @Get('roles')
  roles() {
    return this.admin.roles();
  }

  @RequirePermissions(P.STAFF_MANAGE)
  @ApiOperation({
    summary: 'Give or remove a staff role (roleKey: null removes)',
  })
  @Patch('users/:id/staff-role')
  staffRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: SetStaffRoleDto,
  ) {
    return this.admin.setStaffRole(actor, id, dto.roleKey ?? null);
  }

  @RequirePermissions(P.AUDIT_VIEW)
  @ApiOperation({ summary: 'Audit log (append-only)' })
  @Get('audit-logs')
  auditLogs(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }
}

@ApiTags('Admin — businesses')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@RequirePermissions(P.BUSINESSES_MANAGE)
@Controller('admin/businesses')
export class AdminBusinessesController {
  constructor(private admin: AdminService) {}

  @ApiOperation({ summary: 'All listings, any status' })
  @Get()
  list(@Query() q: AdminBusinessQueryDto) {
    return this.admin.listBusinesses(q);
  }

  @ApiOperation({ summary: 'Likely duplicate pairs across the platform' })
  @Get('duplicates')
  duplicateScan() {
    return this.admin.duplicateScan();
  }

  @ApiOperation({
    summary:
      'Listing detail: identifiers, managers, duplicate candidates, audit trail',
  })
  @Get(':id')
  detail(@Param('id', uuid) id: string) {
    return this.admin.businessDetail(id);
  }

  @ApiOperation({
    summary: 'Create a listing',
    description:
      '409 with duplicateCandidates when similar listings exist (resend with confirmNotDuplicate: true if truly different).',
  })
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateBusinessDto) {
    return this.admin.createBusiness(actor, dto);
  }

  @ApiOperation({
    summary: 'Edit any field, including name and category (audited)',
  })
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AdminUpdateBusinessDto,
  ) {
    return this.admin.updateBusiness(actor, id, dto);
  }

  @ApiOperation({
    summary:
      'Add an identifier (any type, incl. alternative names and CAC number)',
  })
  @Post(':id/identifiers')
  addIdentifier(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: IdentifierInputDto,
  ) {
    return this.admin.addIdentifier(actor, id, dto);
  }

  @ApiOperation({ summary: 'Remove an identifier' })
  @Delete(':id/identifiers/:identifierId')
  removeIdentifier(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('identifierId', uuid) identifierId: string,
  ) {
    return this.admin.removeIdentifier(actor, id, identifierId);
  }

  @ApiOperation({
    summary: 'Publish, suspend, archive, or return to pending review',
  })
  @Patch(':id/status')
  status(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: BusinessStatusDto,
  ) {
    return this.admin.setStatus(actor, id, dto);
  }

  @ApiOperation({
    summary: 'Mark / clear "under investigation" (shown publicly)',
  })
  @Patch(':id/investigation')
  investigation(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: InvestigationDto,
  ) {
    return this.admin.setInvestigation(actor, id, dto);
  }

  @ApiOperation({ summary: 'Duplicate candidates for one listing' })
  @Get(':id/duplicates')
  duplicates(@Param('id', uuid) id: string) {
    return this.admin.duplicatesOf(id);
  }

  @RequirePermissions(P.BUSINESSES_MANAGE, P.BUSINESSES_MERGE)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Merge this listing (source) into targetId',
    description:
      'Moves identifiers, locations, reviews, responses, disputes, claims and managers. The source becomes "merged" and redirects.',
  })
  @Post(':id/merge')
  merge(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: MergeBusinessDto,
  ) {
    return this.admin.merge(actor, id, dto);
  }
}

@ApiTags('Admin — moderation')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('admin')
export class AdminModerationController {
  constructor(private moderation: ModerationAdminService) {}

  @RequirePermissions(P.REVIEWS_MODERATE)
  @ApiOperation({
    summary:
      'Review queues: pending_moderation | under_investigation | reported | evidence | removed',
  })
  @Get('reviews')
  queue(@Query() q: ReviewQueueQueryDto) {
    return this.moderation.queue(q);
  }

  @RequirePermissions(P.REVIEWS_MODERATE)
  @ApiOperation({
    summary:
      'Full review: revisions, flags, reports, disputes, evidence (private links need EVIDENCE_REVIEW), history',
  })
  @Get('reviews/:id')
  review(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.moderation.reviewDetail(actor, id);
  }

  @RequirePermissions(P.REVIEWS_MODERATE)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Moderate a review (policy reason required; removal cannot use NO_VIOLATION)',
  })
  @Post('reviews/:id/moderation')
  moderate(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.moderation.moderateReview(actor, id, dto);
  }

  @RequirePermissions(P.EVIDENCE_REVIEW)
  @ApiOperation({
    summary:
      'Examine evidence: accepted shows "Evidence reviewed"; rejected hides it',
  })
  @Patch('evidence/:id')
  evidence(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: EvidenceDecisionDto,
  ) {
    return this.moderation.decideEvidence(actor, id, dto);
  }

  @RequirePermissions(P.REVIEWS_MODERATE)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remove a business response that breaks content rules',
  })
  @Post('responses/:id/remove')
  removeResponse(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RemoveResponseDto,
  ) {
    return this.moderation.removeResponse(actor, id, dto);
  }

  @RequirePermissions(P.REPORTS_MANAGE)
  @ApiOperation({ summary: 'Review reports (default: open, oldest first)' })
  @Get('reports')
  reports(@Query() q: ReportQueryDto) {
    return this.moderation.reports(q.status, q.page, q.limit);
  }

  @RequirePermissions(P.REPORTS_MANAGE, P.REVIEWS_MODERATE)
  @ApiOperation({
    summary: 'Decide a report: dismiss, remove_review or investigate_review',
  })
  @Patch('reports/:id')
  decideReport(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: DecideReportDto,
  ) {
    return this.moderation.decideReport(actor, id, dto);
  }

  @RequirePermissions(P.DISPUTES_MANAGE)
  @ApiOperation({ summary: 'Business disputes (default: open, oldest first)' })
  @Get('disputes')
  disputes(@Query() q: DisputeQueryDto) {
    return this.moderation.disputes(q.status, q.page, q.limit);
  }

  @RequirePermissions(P.DISPUTES_MANAGE)
  @ApiOperation({ summary: 'Dispute with the full review and its history' })
  @Get('disputes/:id')
  dispute(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.moderation.disputeDetail(actor, id);
  }

  @RequirePermissions(P.DISPUTES_MANAGE, P.REVIEWS_MODERATE)
  @ApiOperation({ summary: 'Decide a dispute (both parties are notified)' })
  @Patch('disputes/:id')
  decideDispute(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: DecideDisputeDto,
  ) {
    return this.moderation.decideDispute(actor, id, dto);
  }
}

@ApiTags('Admin — categories & rating dimensions')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@RequirePermissions(P.TAXONOMY_MANAGE)
@Controller('admin')
export class AdminTaxonomyController {
  constructor(private admin: AdminService) {}

  @ApiOperation({ summary: 'All categories (incl. inactive) and dimensions' })
  @Get('taxonomy')
  list() {
    return this.admin.listTaxonomy();
  }

  @ApiOperation({ summary: 'Add a category (no code change needed — PRD §5)' })
  @Post('categories')
  createCategory(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.admin.createCategory(actor, dto);
  }

  @ApiOperation({
    summary: 'Edit a category and (optionally) replace its rating dimensions',
  })
  @Patch('categories/:slug')
  updateCategory(
    @CurrentUser() actor: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: UpsertCategoryDto,
  ) {
    return this.admin.updateCategory(actor, slug, dto);
  }

  @ApiOperation({ summary: 'Add a rating dimension' })
  @Post('dimensions')
  createDimension(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateDimensionDto,
  ) {
    return this.admin.createDimension(actor, dto);
  }

  @ApiOperation({ summary: 'Edit or deactivate a rating dimension' })
  @Patch('dimensions/:key')
  updateDimension(
    @CurrentUser() actor: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpsertDimensionDto,
  ) {
    return this.admin.updateDimension(actor, key, dto);
  }
}
