import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  ModerateReviewDto,
  ResolveSuggestionDto,
  SuspendUserDto,
} from './admin.dto';
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
  @ApiBody({ type: CreateBrandDto })
  @Post('admin/brands')
  createBrand(@Body() dto: CreateBrandDto) {
    return this.admin.createBrand(dto);
  }

  @ApiOperation({
    summary: 'PATCH /admin/brands/{id} — Update brand (incl. claimed)',
    description:
      'Set claimed:true ONLY after verifying the business. Public users cannot claim.',
  })
  @ApiBody({ type: UpdateBrandDto })
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
  reviewQueue(@Query() query: AdminReviewQueueQueryDto) {
    return this.admin.reviewQueue(query.queue ?? 'flagged');
  }

  @ApiOperation({
    summary: 'PATCH /admin/reviews/{id} — Moderate review',
  })
  @ApiBody({ type: ModerateReviewDto })
  @Patch('admin/reviews/:id')
  moderateReview(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.admin.moderateReview(id, dto.action, dto.note, dto.approved);
  }

  @ApiOperation({ summary: 'GET /admin/suggestions — Pending brand suggestions' })
  @Get('admin/suggestions')
  listSuggestions() {
    return this.admin.listSuggestions();
  }

  @ApiOperation({
    summary: 'PATCH /admin/suggestions/{id} — Approve or reject',
  })
  @ApiBody({ type: ResolveSuggestionDto })
  @Patch('admin/suggestions/:id')
  resolveSuggestion(
    @Param('id') id: string,
    @Body() dto: ResolveSuggestionDto,
  ) {
    return this.admin.resolveSuggestion(id, dto.status, dto.adminNote);
  }

  @ApiOperation({
    summary: 'PATCH /admin/users/{id}/suspend — Suspend user',
  })
  @ApiBody({ type: SuspendUserDto })
  @Patch('admin/users/:id/suspend')
  suspendUser(@Param('id') id: string, @Body() dto: SuspendUserDto) {
    return this.admin.suspendUser(id, dto.suspended, dto.reason);
  }
}

@ApiTags('Brand suggestions')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller('brand-suggestions')
export class BrandSuggestionsController {
  constructor(private admin: AdminService) {}

  @ApiOperation({ summary: 'POST /brand-suggestions — Suggest a missing brand (JWT)' })
  @ApiBody({ type: BrandSuggestionDto })
  @Post()
  suggest(@CurrentUser() user: { id: string }, @Body() dto: BrandSuggestionDto) {
    return this.admin.suggestBrand(user.id, dto);
  }
}
