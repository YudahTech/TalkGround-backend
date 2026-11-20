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
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { OptionalAuth } from '../common/decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';
import {
  ApiData,
  ApiErrors,
  ApiMessage,
  ApiPaged,
} from '../common/api-response';
import { ReviewsService } from './reviews.service';
import {
  AddEvidenceDto,
  ConsumerResolutionDto,
  CreateReviewDto,
  MyReviewsQueryDto,
  ReportDto,
  UpdateReviewDto,
} from './reviews.dto';
import {
  EvidenceCreatedDto,
  HelpfulStateDto,
  MyReviewDto,
  ReportReceiptDto,
  ResolutionDto,
  ReviewCreatedDto,
  ReviewDetailDto,
  ReviewDto,
  RevisionDto,
} from './reviews.responses';

const MINUTE = 60_000;
const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Reviews')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller()
export class ReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary: 'Write a review (verified email required)',
    description:
      'Rate overall (required) and the category dimensions (GET /categories/:slug; required ones must be rated). ' +
      'Title 3–120 chars, body REVIEW_BODY_MIN_LENGTH–5000. One active review per business: a repeat experience is an update (409 returns details.reviewId). ' +
      'Most reviews publish at once; some are held for a moderator check (data.moderation).',
  })
  @ApiData(ReviewCreatedDto, { status: 201 })
  @ApiErrors(400, 401, 403, 404, 409)
  @Post('reviews')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReviewDto,
    @Req() req: Request,
  ) {
    return this.reviews.create(user, dto, req.ip);
  }

  @ApiOperation({ summary: 'My reviews, every status' })
  @ApiPaged(MyReviewDto)
  @ApiErrors(401)
  @Get('users/me/reviews')
  mine(@CurrentUser() user: AuthUser, @Query() q: MyReviewsQueryDto) {
    return this.reviews.mine(user.id, q.page, q.limit);
  }

  @OptionalAuth()
  @ApiOperation({
    summary: 'One review with its business response and resolution history',
  })
  @ApiData(ReviewDetailDto)
  @ApiErrors(404)
  @Get('reviews/:id')
  getOne(@Param('id', uuid) id: string, @CurrentUser() user?: AuthUser | null) {
    return this.reviews.getOne(id, user);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Update my review (e.g. a repeat experience). Every previous version is kept.',
  })
  @ApiData(ReviewDto)
  @ApiErrors(400, 401, 403, 404)
  @Patch('reviews/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateReviewDto,
    @Req() req: Request,
  ) {
    return this.reviews.update(user, id, dto, req.ip);
  }

  @ApiOperation({
    summary:
      'Delete my review (soft delete: hidden publicly, kept for moderation)',
  })
  @ApiMessage()
  @ApiErrors(401, 403, 404)
  @Delete('reviews/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.reviews.softDelete(user, id);
  }

  @ApiOperation({ summary: 'Previous versions of my review' })
  @ApiData(RevisionDto, { isArray: true })
  @ApiErrors(401, 403, 404)
  @Get('reviews/:id/revisions')
  revisions(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.reviews.revisions(user, id);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary: 'Attach evidence to my review',
    description:
      'Upload first via POST /uploads/signature: folder "evidence" for a public PHOTO, "receipts" for a private RECEIPT. ' +
      'Sets evidenceAttached; evidenceStatus becomes "accepted" only after a moderator examines it.',
  })
  @ApiData(EvidenceCreatedDto, { status: 201 })
  @ApiErrors(400, 401, 403, 404, 503)
  @Post('reviews/:id/evidence')
  addEvidence(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AddEvidenceDto,
  ) {
    return this.reviews.addEvidence(user, id, dto);
  }

  @ApiOperation({
    summary:
      'Remove evidence from my review (not after a moderator accepted it)',
  })
  @ApiMessage()
  @ApiErrors(401, 403, 404)
  @Delete('reviews/:id/evidence/:evidenceId')
  removeEvidence(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('evidenceId', uuid) evidenceId: string,
  ) {
    return this.reviews.removeEvidence(user, id, evidenceId);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  @ApiOperation({ summary: 'Toggle "helpful" (one vote per user per review)' })
  @ApiData(HelpfulStateDto)
  @ApiErrors(400, 401, 403, 404, 429)
  @Post('reviews/:id/helpful')
  helpful(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.reviews.toggleHelpful(user, id);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({ summary: 'Report a review (consumers and business members)' })
  @ApiData(ReportReceiptDto, { status: 201 })
  @ApiErrors(400, 401, 404, 409)
  @Post('reviews/:id/reports')
  report(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ReportDto,
  ) {
    return this.reviews.report(user, id, dto, 'review');
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({ summary: "Report a business's response to a review" })
  @ApiData(ReportReceiptDto, { status: 201 })
  @ApiErrors(400, 401, 404, 409)
  @Post('reviews/:id/response/reports')
  reportResponse(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ReportDto,
  ) {
    return this.reviews.report(user, id, dto, 'response');
  }

  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark my complaint resolved, or reopen it (reviewer only)',
    description:
      'A business can only propose a resolution. Never changes the rating.',
  })
  @ApiData(ResolutionDto)
  @ApiErrors(400, 401, 403, 404)
  @Post('reviews/:id/resolution')
  resolution(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ConsumerResolutionDto,
  ) {
    return this.reviews.consumerResolution(user, id, dto);
  }
}
