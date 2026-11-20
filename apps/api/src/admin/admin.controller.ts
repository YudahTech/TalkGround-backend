import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { PERMISSIONS as P, RequirePermissions } from '../common/permissions';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';
import {
  ApiData,
  ApiErrors,
  ApiMessage,
  ApiPaged,
} from '../common/api-response';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AdminUpdateBusinessDto,
  CreateBusinessDto,
  IdentifierInputDto,
} from '../businesses/businesses.dto';
import { DuplicateCandidateDto } from '../businesses/businesses.responses';
import { IdentifierAddedDto } from '../portal/portal.responses';
import { AdminService } from './admin.service';
import { ModerationAdminService } from './moderation-admin.service';
import {
  AdminBusinessQueryDto,
  AuditQueryDto,
  BusinessStatusDto,
  CreateCategoryDto,
  CreateCityDto,
  CreateDimensionDto,
  DecideDisputeDto,
  DecideReportDto,
  DisputeQueryDto,
  EditReviewContentDto,
  EmailLogQueryDto,
  EvidenceStatusDto,
  MergeBusinessDto,
  ModerateReviewDto,
  NoindexDto,
  RemoveResponseDto,
  ReportQueryDto,
  ReviewQueueQueryDto,
  SetStaffRoleDto,
  SuspendUserDto,
  UpdateCategoryDto,
  UpdateCityDto,
  UpdateDimensionDto,
  UserListQueryDto,
} from './admin.dto';
import {
  AdminBusinessDetailDto,
  AdminBusinessListItemDto,
  AdminDashboardDto,
  AdminDisputeDetailDto,
  AdminDisputeDto,
  AdminReportDto,
  AdminReviewDetailDto,
  AdminUserDetailDto,
  AdminUserDto,
  AuditLogDto,
  CategoryAdminDto,
  CityAdminDto,
  DimensionAdminDto,
  DuplicatePairDto,
  EmailLogDto,
  EmailRetryDto,
  MergeResultDto,
  ModerationResultDto,
  QueueItemDto,
  RolesDto,
  TaxonomyDto,
} from './admin.responses';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Admin — overview, users, roles, audit')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@ApiErrors(401, 403)
@Controller('admin')
export class AdminUsersController {
  constructor(
    private admin: AdminService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  @RequirePermissions()
  @ApiOperation({ summary: 'Totals and work queues (any staff role)' })
  @ApiData(AdminDashboardDto)
  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @RequirePermissions(P.USER_SUSPEND)
  @ApiOperation({ summary: 'Users — user.suspend' })
  @ApiPaged(AdminUserDto)
  @Get('users')
  users(@Query() q: UserListQueryDto) {
    return this.admin.listUsers(q);
  }

  @RequirePermissions(P.USER_SUSPEND)
  @ApiOperation({ summary: 'User detail — user.suspend' })
  @ApiData(AdminUserDetailDto)
  @ApiErrors(404)
  @Get('users/:id')
  user(@Param('id', uuid) id: string) {
    return this.admin.userDetail(id);
  }

  @RequirePermissions(P.USER_SUSPEND)
  @ApiOperation({
    summary:
      'Suspend / unsuspend (signs the user out everywhere) — user.suspend',
  })
  @ApiData(AdminUserDto)
  @ApiErrors(400, 404)
  @Patch('users/:id/suspension')
  suspend(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.admin.suspendUser(actor, id, dto.suspended, dto.reason);
  }

  @RequirePermissions(P.ROLE_ASSIGN)
  @ApiOperation({ summary: 'Staff roles and permissions — role.assign' })
  @ApiData(RolesDto)
  @Get('roles')
  roles() {
    return this.admin.roles();
  }

  @RequirePermissions(P.ROLE_ASSIGN)
  @ApiOperation({
    summary:
      'Assign or remove a staff role (roleKey null removes) — role.assign',
  })
  @ApiData(AdminUserDto)
  @ApiErrors(400, 404, 409)
  @Patch('users/:id/staff-role')
  staffRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: SetStaffRoleDto,
  ) {
    return this.admin.setStaffRole(actor, id, dto.roleKey ?? null, dto.reason);
  }

  @RequirePermissions(P.AUDITLOG_EXPORT)
  @ApiOperation({ summary: 'Audit log (append-only) — auditlog.export' })
  @ApiPaged(AuditLogDto)
  @ApiErrors(400)
  @Get('audit-logs')
  auditLogs(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }

  @RequirePermissions(P.AUDITLOG_EXPORT)
  @ApiOperation({
    summary:
      'Export the audit log as CSV (max 10,000 rows per request) — auditlog.export',
  })
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="talkground-audit-log.csv"',
  )
  @Get('audit-logs/export')
  async exportAudit(@CurrentUser() actor: AuthUser, @Query() q: AuditQueryDto) {
    const { page: _p, limit: _l, ...filters } = q;
    const csv = await this.audit.exportCsv(filters);
    await this.audit.record(
      { id: actor.id, role: actor.adminRole ?? undefined },
      {
        action: 'auditlog.export',
        targetType: 'role',
        targetId: actor.id,
        metadata: { filters },
      },
    );
    return csv;
  }

  @RequirePermissions(P.USER_SUSPEND)
  @ApiOperation({
    summary: 'Transactional email delivery log (PRD §7.14) — user.suspend',
  })
  @ApiPaged(EmailLogDto)
  @Get('emails')
  emails(@Query() q: EmailLogQueryDto) {
    return this.notifications.list(q.status, q.page, q.limit);
  }

  @RequirePermissions(P.USER_SUSPEND)
  @HttpCode(200)
  @ApiOperation({ summary: 'Retry a failed email now — user.suspend' })
  @ApiData(EmailRetryDto)
  @ApiErrors(404)
  @Post('emails/:id/retry')
  retryEmail(@Param('id', uuid) id: string) {
    return this.notifications.retryOne(id);
  }
}

@ApiTags('Admin — businesses')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@ApiErrors(401, 403)
@Controller('admin/businesses')
export class AdminBusinessesController {
  constructor(private admin: AdminService) {}

  @RequirePermissions(P.BUSINESS_EDIT)
  @ApiOperation({ summary: 'All listings, any status — business.edit' })
  @ApiPaged(AdminBusinessListItemDto)
  @Get()
  list(@Query() q: AdminBusinessQueryDto) {
    return this.admin.listBusinesses(q);
  }

  @RequirePermissions(P.BUSINESS_EDIT)
  @ApiOperation({
    summary:
      'Possible duplicate pairs (shared identifiers, similar names) — business.edit',
  })
  @ApiData(DuplicatePairDto, { isArray: true })
  @Get('duplicates')
  duplicateScan() {
    return this.admin.duplicateScan();
  }

  @RequirePermissions(P.BUSINESS_EDIT)
  @ApiOperation({
    summary:
      'Listing detail: identifiers, slugs, members, duplicates, allowed transitions, audit trail — business.edit',
  })
  @ApiData(AdminBusinessDetailDto)
  @ApiErrors(404)
  @Get(':id')
  detail(@Param('id', uuid) id: string) {
    return this.admin.businessDetail(id);
  }

  @RequirePermissions(P.BUSINESS_CREATE)
  @ApiOperation({
    summary: 'Create a listing — business.create',
    description:
      '409 with details.duplicateCandidates when possible duplicates exist (resend with confirmNotDuplicate: true).',
  })
  @ApiData(AdminBusinessDetailDto, { status: 201 })
  @ApiErrors(400, 409)
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateBusinessDto) {
    return this.admin.createBusiness(actor, dto);
  }

  @RequirePermissions(P.BUSINESS_EDIT)
  @ApiOperation({
    summary:
      'Edit any field. Renaming regenerates the slug; the old one 301s. — business.edit',
  })
  @ApiData(AdminBusinessDetailDto)
  @ApiErrors(400, 404)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AdminUpdateBusinessDto,
  ) {
    return this.admin.updateBusiness(actor, id, dto);
  }

  @RequirePermissions(P.BUSINESS_EDIT)
  @ApiOperation({ summary: 'Add an identifier (any type) — business.edit' })
  @ApiData(IdentifierAddedDto, { status: 201 })
  @ApiErrors(400, 404)
  @Post(':id/identifiers')
  addIdentifier(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: IdentifierInputDto,
  ) {
    return this.admin.addIdentifier(actor, id, dto);
  }

  @RequirePermissions(P.BUSINESS_EDIT)
  @ApiOperation({ summary: 'Remove an identifier — business.edit' })
  @ApiMessage()
  @ApiErrors(404)
  @Delete(':id/identifiers/:identifierId')
  removeIdentifier(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('identifierId', uuid) identifierId: string,
  ) {
    return this.admin.removeIdentifier(actor, id, identifierId);
  }

  @RequirePermissions(P.BUSINESS_EDIT)
  @ApiOperation({
    summary:
      'Lifecycle transition (PRD §7.4). Suspend / unsuspend also needs business.suspend.',
  })
  @ApiData(AdminBusinessDetailDto)
  @ApiErrors(400, 404)
  @Patch(':id/status')
  status(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: BusinessStatusDto,
  ) {
    return this.admin.setStatus(actor, id, dto);
  }

  @RequirePermissions(P.REVIEW_MODERATE)
  @ApiOperation({
    summary: 'Force noindex on / off (e.g. legal complaint) — review.moderate',
  })
  @ApiData(AdminBusinessDetailDto)
  @ApiErrors(404)
  @Patch(':id/noindex')
  noindex(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: NoindexDto,
  ) {
    return this.admin.setNoindex(actor, id, dto);
  }

  @RequirePermissions(P.BUSINESS_EDIT)
  @ApiOperation({
    summary: 'Possible duplicates of one listing — business.edit',
  })
  @ApiData(DuplicateCandidateDto, { isArray: true })
  @ApiErrors(404)
  @Get(':id/duplicates')
  duplicates(@Param('id', uuid) id: string) {
    return this.admin.duplicatesOf(id);
  }

  @RequirePermissions(P.BUSINESS_MERGE)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Merge this listing into targetId (moves reviews; old URL 301s) — business.merge',
  })
  @ApiData(MergeResultDto)
  @ApiErrors(400, 404)
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
@ApiErrors(401, 403)
@Controller('admin')
export class AdminModerationController {
  constructor(private moderation: ModerationAdminService) {}

  @RequirePermissions(P.REVIEW_MODERATE)
  @ApiOperation({
    summary:
      'Review queues: pending | under_investigation | reported | evidence | suspended | removed — review.moderate',
  })
  @ApiPaged(QueueItemDto)
  @Get('reviews')
  queue(@Query() q: ReviewQueueQueryDto) {
    return this.moderation.queue(q);
  }

  @RequirePermissions(P.REVIEW_MODERATE)
  @ApiOperation({
    summary:
      'Full review incl. edit history; receipt links need evidence.review — review.moderate',
  })
  @ApiData(AdminReviewDetailDto)
  @ApiErrors(404)
  @Get('reviews/:id')
  review(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.moderation.reviewDetail(actor, id);
  }

  @RequirePermissions(P.REVIEW_MODERATE)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Publish, suspend, remove, restore or investigate (recorded reason) — review.moderate',
  })
  @ApiData(ModerationResultDto)
  @ApiErrors(400, 404)
  @Post('reviews/:id/moderation')
  moderate(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.moderation.moderateReview(actor, id, dto);
  }

  @RequirePermissions(P.REVIEW_MODERATE)
  @ApiOperation({
    summary:
      'Edit review content (e.g. redact personal info); the previous version is kept — review.moderate',
  })
  @ApiData(ModerationResultDto)
  @ApiErrors(400, 404)
  @Patch('reviews/:id/content')
  edit(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: EditReviewContentDto,
  ) {
    return this.moderation.editReviewContent(actor, id, dto);
  }

  @RequirePermissions(P.EVIDENCE_REVIEW)
  @ApiOperation({
    summary:
      'Set evidenceStatus after examining the evidence — evidence.review',
  })
  @ApiData(ModerationResultDto)
  @ApiErrors(400, 404)
  @Patch('reviews/:id/evidence-status')
  evidence(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: EvidenceStatusDto,
  ) {
    return this.moderation.setEvidenceStatus(actor, id, dto);
  }

  @RequirePermissions(P.REVIEW_MODERATE)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Remove a business response that breaks the content policy — review.moderate',
  })
  @ApiData(ModerationResultDto)
  @ApiErrors(400, 404, 409)
  @Post('responses/:id/remove')
  removeResponse(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RemoveResponseDto,
  ) {
    return this.moderation.removeResponse(actor, id, dto);
  }

  @RequirePermissions(P.REPORT_RESOLVE)
  @ApiOperation({
    summary:
      'Reports on reviews and responses (default: open) — report.resolve',
  })
  @ApiPaged(AdminReportDto)
  @Get('reports')
  reports(@Query() q: ReportQueryDto) {
    return this.moderation.reports(q.status, q.page, q.limit);
  }

  @RequirePermissions(P.REPORT_RESOLVE)
  @ApiOperation({
    summary:
      'Decide a report: dismiss, suspend, remove or investigate — report.resolve',
  })
  @ApiData(ModerationResultDto)
  @ApiErrors(400, 404, 409)
  @Patch('reports/:id')
  decideReport(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: DecideReportDto,
  ) {
    return this.moderation.decideReport(actor, id, dto);
  }

  @RequirePermissions(P.DISPUTE_DECIDE)
  @ApiOperation({
    summary:
      'Business disputes (default: active = open + under_review) — dispute.decide',
  })
  @ApiPaged(AdminDisputeDto)
  @Get('disputes')
  disputes(@Query() q: DisputeQueryDto) {
    return this.moderation.disputes(q.status, q.page, q.limit);
  }

  @RequirePermissions(P.DISPUTE_DECIDE)
  @ApiOperation({
    summary: 'Dispute with the full review and its history — dispute.decide',
  })
  @ApiData(AdminDisputeDetailDto)
  @ApiErrors(404)
  @Get('disputes/:id')
  dispute(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.moderation.disputeDetail(actor, id);
  }

  @RequirePermissions(P.DISPUTE_DECIDE)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Take a dispute under review (OPEN → UNDER_REVIEW) — dispute.decide',
  })
  @ApiData(ModerationResultDto)
  @ApiErrors(404, 409)
  @Post('disputes/:id/start-review')
  startReview(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string) {
    return this.moderation.startDisputeReview(actor, id);
  }

  @RequirePermissions(P.DISPUTE_DECIDE)
  @ApiOperation({
    summary:
      'Decide: upheld (review stays) | review_actioned | closed. Both parties are emailed. — dispute.decide',
  })
  @ApiData(ModerationResultDto)
  @ApiErrors(400, 404, 409)
  @Patch('disputes/:id')
  decideDispute(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: DecideDisputeDto,
  ) {
    return this.moderation.decideDispute(actor, id, dto);
  }
}

@ApiTags('Admin — categories, dimensions & cities')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@RequirePermissions(P.CATEGORY_MANAGE)
@ApiErrors(401, 403)
@Controller('admin')
export class AdminTaxonomyController {
  constructor(private admin: AdminService) {}

  @ApiOperation({
    summary:
      'All categories (incl. inactive), dimensions and cities — category.manage',
  })
  @ApiData(TaxonomyDto)
  @Get('taxonomy')
  list() {
    return this.admin.listTaxonomy();
  }

  @ApiOperation({
    summary: 'Add a category (no deploy needed) — category.manage',
  })
  @ApiData(CategoryAdminDto, { status: 201 })
  @ApiErrors(400, 409)
  @Post('categories')
  createCategory(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.admin.createCategory(actor, dto);
  }

  @ApiOperation({
    summary:
      'Edit or (de)activate a category; optionally replace its dimensions — category.manage',
  })
  @ApiData(CategoryAdminDto)
  @ApiErrors(400, 404)
  @Patch('categories/:slug')
  updateCategory(
    @CurrentUser() actor: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.admin.updateCategory(actor, slug, dto);
  }

  @ApiOperation({ summary: 'Add a rating dimension — category.manage' })
  @ApiData(DimensionAdminDto, { status: 201 })
  @ApiErrors(400, 409)
  @Post('dimensions')
  createDimension(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateDimensionDto,
  ) {
    return this.admin.createDimension(actor, dto);
  }

  @ApiOperation({
    summary: 'Edit or deactivate a rating dimension — category.manage',
  })
  @ApiData(DimensionAdminDto)
  @ApiErrors(400, 404)
  @Patch('dimensions/:key')
  updateDimension(
    @CurrentUser() actor: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateDimensionDto,
  ) {
    return this.admin.updateDimension(actor, key, dto);
  }

  @ApiOperation({ summary: 'Add a city (no deploy needed) — category.manage' })
  @ApiData(CityAdminDto, { status: 201 })
  @ApiErrors(400, 409)
  @Post('cities')
  createCity(@CurrentUser() actor: AuthUser, @Body() dto: CreateCityDto) {
    return this.admin.createCity(actor, dto);
  }

  @ApiOperation({ summary: 'Edit or (de)activate a city — category.manage' })
  @ApiData(CityAdminDto)
  @ApiErrors(400, 404)
  @Patch('cities/:slug')
  updateCity(
    @CurrentUser() actor: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: UpdateCityDto,
  ) {
    return this.admin.updateCity(actor, slug, dto);
  }
}
