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
  Put,
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
import { ReviewsService } from './reviews.service';
import {
  AddEvidenceDto,
  ConsumerResolutionDto,
  CreateReviewDto,
  MyReviewsQueryDto,
  ReportReviewDto,
  UpdateReviewDto,
  VoteDto,
} from './reviews.dto';

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
      'Rate the required dimensions of the business category (GET /categories/:slug). ' +
      'Most reviews publish immediately; some are held for a quick moderator check (data.moderation explains). ' +
      'One current review per business: edit it, or after the repeat period send newExperience: true.',
  })
  @Post('reviews')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReviewDto,
    @Req() req: Request,
  ) {
    return this.reviews.create(user, dto, req.ip);
  }

  @ApiOperation({ summary: 'My reviews, every status (review history)' })
  @Get('users/me/reviews')
  mine(@CurrentUser() user: AuthUser, @Query() q: MyReviewsQueryDto) {
    return this.reviews.mine(user.id, q.page, q.limit);
  }

  @OptionalAuth()
  @ApiOperation({
    summary: 'One review with its business response and resolution history',
  })
  @Get('reviews/:id')
  getOne(@Param('id', uuid) id: string, @CurrentUser() user?: AuthUser | null) {
    return this.reviews.getOne(id, user);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Edit my review (previous version is kept; limited number of edits)',
  })
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
    summary: 'Withdraw my review (hidden publicly, history kept)',
  })
  @Delete('reviews/:id')
  withdraw(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.reviews.withdraw(user, id);
  }

  @ApiOperation({ summary: 'Previous versions of my review' })
  @Get('reviews/:id/revisions')
  revisions(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.reviews.revisions(user, id);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary: 'Attach evidence to my review',
    description:
      'Upload first via POST /uploads/signature: folder "evidence" for a public PHOTO, "evidence-private" for RECEIPT / SCREENSHOT / DOCUMENT. ' +
      'Attached evidence shows the "Evidence attached" label; "Evidence reviewed" only appears after a moderator examines it.',
  })
  @Post('reviews/:id/evidence')
  addEvidence(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AddEvidenceDto,
  ) {
    return this.reviews.addEvidence(user, id, dto);
  }

  @ApiOperation({
    summary: 'Remove evidence from my review (not once it has been reviewed)',
  })
  @Delete('reviews/:id/evidence/:evidenceId')
  removeEvidence(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('evidenceId', uuid) evidenceId: string,
  ) {
    return this.reviews.removeEvidence(user, id, evidenceId);
  }

  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Vote helpful / not helpful (one vote per review; send again to change)',
  })
  @Put('reviews/:id/vote')
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: VoteDto,
  ) {
    return this.reviews.vote(user, id, dto.helpful);
  }

  @ApiOperation({ summary: 'Remove my vote' })
  @Delete('reviews/:id/vote')
  removeVote(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.reviews.removeVote(user, id);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Report a review that breaks the rules (consumers and business representatives)',
  })
  @Post('reviews/:id/reports')
  report(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reviews.report(user, id, dto);
  }

  @HttpCode(200)
  @ApiOperation({
    summary: 'Report my complaint resolved, or reopen it (review author only)',
    description:
      'Businesses can only PROPOSE a resolution; only the reviewer can mark it resolved. Never changes the rating.',
  })
  @Post('reviews/:id/resolution')
  resolution(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ConsumerResolutionDto,
  ) {
    return this.reviews.consumerResolution(user, id, dto);
  }
}
