import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators';
import {
  CreateBrandDto,
  UpdateBrandDto,
  BrandSuggestionDto,
} from '../brands/brands.dto';
import { CurrentUser } from '../common/current-user.decorator';
import { SWAGGER_BEARER_AUTH } from '../common/swagger';

@ApiTags('Admin (JWT + ADMIN role)')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller()
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private admin: AdminService) {}

  @ApiOperation({ summary: 'GET /admin/dashboard — Admin counts' })
  @Get('admin/dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @ApiOperation({ summary: 'GET /admin/brands — List all brands' })
  @Get('admin/brands')
  listBrands() {
    return this.admin.listBrands();
  }

  @ApiOperation({ summary: 'POST /admin/brands — Create brand' })
  @Post('admin/brands')
  createBrand(@Body() dto: CreateBrandDto) {
    return this.admin.createBrand(dto);
  }

  @ApiOperation({
    summary: 'PATCH /admin/brands/{id} — Update brand (incl. claimed)',
    description:
      'Set claimed:true ONLY after verifying the business. Public users cannot claim.',
  })
  @Patch('admin/brands/:id')
  updateBrand(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.admin.updateBrand(id, dto);
  }

  @ApiOperation({ summary: 'DELETE /admin/brands/{id} — Deactivate brand' })
  @Delete('admin/brands/:id')
  deactivateBrand(@Param('id') id: string) {
    return this.admin.deactivateBrand(id);
  }

  @ApiOperation({
    summary: 'GET /admin/reviews/queue — Moderation queue',
    description: 'Query queue=flagged|reported|pending_receipt|suspended',
  })
  @Get('admin/reviews/queue')
  reviewQueue(@Query('queue') queue: string) {
    return this.admin.reviewQueue(queue ?? 'flagged');
  }

  @ApiOperation({
    summary: 'PATCH /admin/reviews/{id} — Moderate review',
    description: 'Body: { action: approve|suspend|remove|dismiss_report|verify_receipt, note?, approved? }',
  })
  @Patch('admin/reviews/:id')
  moderateReview(
    @Param('id') id: string,
    @Body() body: { action: string; note?: string; approved?: boolean },
  ) {
    return this.admin.moderateReview(id, body.action, body.note, body.approved);
  }

  @ApiOperation({ summary: 'GET /admin/suggestions — Pending brand suggestions' })
  @Get('admin/suggestions')
  listSuggestions() {
    return this.admin.listSuggestions();
  }

  @ApiOperation({
    summary: 'PATCH /admin/suggestions/{id} — Approve or reject',
    description: 'Body: { status: approved|rejected, adminNote? }',
  })
  @Patch('admin/suggestions/:id')
  resolveSuggestion(
    @Param('id') id: string,
    @Body() body: { status: 'approved' | 'rejected'; adminNote?: string },
  ) {
    return this.admin.resolveSuggestion(id, body.status, body.adminNote);
  }

  @ApiOperation({
    summary: 'PATCH /admin/users/{id}/suspend — Suspend user',
    description: 'Body: { suspended: true|false, reason: string }',
  })
  @Patch('admin/users/:id/suspend')
  suspendUser(
    @Param('id') id: string,
    @Body() body: { suspended: boolean; reason: string },
  ) {
    return this.admin.suspendUser(id, body.suspended, body.reason);
  }
}

@ApiTags('Brand suggestions')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller('brand-suggestions')
export class BrandSuggestionsController {
  constructor(private admin: AdminService) {}

  @ApiOperation({ summary: 'POST /brand-suggestions — Suggest a missing brand (JWT)' })
  @Post()
  suggest(@CurrentUser() user: { id: string }, @Body() dto: BrandSuggestionDto) {
    return this.admin.suggestBrand(user.id, dto);
  }
}
