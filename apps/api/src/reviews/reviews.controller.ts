import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import {
  AddMediaDto,
  CreateReviewDto,
  ListBrandReviewsQueryDto,
  ReportReviewDto,
  UpdateReviewDto,
} from '../brands/brands.dto';
import { CurrentUser } from '../common/current-user.decorator';
import { OptionalAuth, Public } from '../common/decorators';
import { SWAGGER_BEARER_AUTH } from '../common/swagger';

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private reviews: ReviewsService) {}

  @OptionalAuth()
  @ApiOperation({
    summary: 'List reviews for a brand (public; optional JWT for helpfulByMe)',
    description:
      'Query: sort=recent|rating_high|rating_low|helpful|verified_first (default recent). page default 1, limit default 20.',
  })
  @Get('brands/:slug/reviews')
  findByBrand(
    @Param('slug') slug: string,
    @Query() query: ListBrandReviewsQueryDto,
    @CurrentUser() user?: { id: string } | null,
  ) {
    return this.reviews.findByBrandSlug(
      slug,
      query.sort ?? 'recent',
      query.page ?? 1,
      query.limit ?? 20,
      user?.id,
    );
  }

  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({
    summary: 'Create review (JWT; verified email + phone required)',
    description:
      'Returns 403 "Verify your email and phone…" until both are verified (configurable via REVIEW_REQUIRE_*_VERIFIED). Max 3 per 24h, one per brand.',
  })
  @ApiBody({ type: CreateReviewDto })
  @Post('reviews')
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateReviewDto,
    @Req() req: { ip?: string; socket: { remoteAddress?: string } },
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    return this.reviews.create(user, dto, ip);
  }

  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Update own review (JWT). Previous version is kept; trust checks re-run.' })
  @ApiBody({ type: UpdateReviewDto })
  @Patch('reviews/:id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @Req() req: { ip?: string; socket: { remoteAddress?: string } },
  ) {
    return this.reviews.update(user, id, dto, req.ip || req.socket.remoteAddress);
  }

  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Soft-delete own review (JWT)' })
  @Delete('reviews/:id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.reviews.remove(user, id);
  }

  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({
    summary: 'Attach photo/receipt URL after Cloudinary upload (JWT)',
  })
  @ApiBody({ type: AddMediaDto })
  @Post('reviews/:id/media')
  addMedia(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: AddMediaDto,
  ) {
    return this.reviews.addMedia(user, id, dto);
  }

  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Report a review (JWT)' })
  @ApiBody({ type: ReportReviewDto })
  @Post('reviews/:id/report')
  report(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reviews.report(user, id, dto);
  }

  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Toggle helpful vote (JWT)' })
  @Post('reviews/:id/helpful')
  toggleHelpful(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.reviews.toggleHelpful(user.id, id);
  }

  @Public()
  @ApiOperation({ summary: 'Increment review view count (public)' })
  @Post('reviews/:id/view')
  recordView(@Param('id') id: string) {
    return this.reviews.recordView(id);
  }
}
