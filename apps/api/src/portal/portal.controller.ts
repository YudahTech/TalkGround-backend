import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';
import {
  ApiData,
  ApiErrors,
  ApiMessage,
  ApiPaged,
} from '../common/api-response';
import {
  IdentifierInputDto,
  ManageBusinessDto,
} from '../businesses/businesses.dto';
import { ResolutionDto } from '../reviews/reviews.responses';
import { PortalService } from './portal.service';
import {
  CreateDisputeDto,
  PortalReviewQueryDto,
  ProposeResolutionDto,
  ResponseBodyDto,
} from './portal.dto';
import {
  DashboardDto,
  DisputeCreatedDto,
  IdentifierAddedDto,
  IssuesDto,
  ManagementViewDto,
  MyBusinessDto,
  OwnResponseDto,
  PortalReviewDto,
  ShareLinksDto,
} from './portal.responses';

const MINUTE = 60_000;
const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Business member area. Every route checks server-side that the caller is an active member of
 * :businessId (PRD §4) — a staff role does not grant this.
 */
@ApiTags('Business dashboard (members)')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@ApiErrors(401, 403)
@Controller()
export class PortalController {
  constructor(private portal: PortalService) {}

  @ApiOperation({ summary: 'Businesses I am a member of' })
  @ApiData(MyBusinessDto, { isArray: true })
  @Get('users/me/businesses')
  mine(@CurrentUser() user: AuthUser) {
    return this.portal.myBusinesses(user.id);
  }

  @ApiOperation({
    summary:
      'Management view: editable fields, identifiers, indexing checklist',
  })
  @ApiData(ManagementViewDto)
  @ApiErrors(404)
  @Get('manage/businesses/:businessId')
  view(@CurrentUser() user: AuthUser, @Param('businessId', uuid) id: string) {
    return this.portal.managementView(user, id);
  }

  @ApiOperation({
    summary: 'Edit permitted profile fields (not name or category)',
  })
  @ApiData(ManagementViewDto)
  @ApiErrors(400, 404)
  @Patch('manage/businesses/:businessId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Body() dto: ManageBusinessDto,
  ) {
    return this.portal.updateProfile(user, id, dto);
  }

  @ApiOperation({
    summary: 'Add a public link (social handle, website, phone, email)',
  })
  @ApiData(IdentifierAddedDto, { status: 201 })
  @ApiErrors(400)
  @Post('manage/businesses/:businessId/identifiers')
  addIdentifier(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Body() dto: IdentifierInputDto,
  ) {
    return this.portal.addIdentifier(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a public link' })
  @ApiMessage()
  @ApiErrors(404)
  @Delete('manage/businesses/:businessId/identifiers/:identifierId')
  removeIdentifier(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Param('identifierId', uuid) identifierId: string,
  ) {
    return this.portal.removeIdentifier(user, id, identifierId);
  }

  @ApiOperation({
    summary:
      'Dashboard overview (rating, distribution, dimensions, response rate/time, unresolved complaints, 6-month trend)',
  })
  @ApiData(DashboardDto)
  @Get('manage/businesses/:businessId/dashboard')
  dashboard(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
  ) {
    return this.portal.dashboard(user, id);
  }

  @ApiOperation({
    summary:
      'Reviews of my business (filter: all | unanswered | complaints | unresolved)',
  })
  @ApiPaged(PortalReviewDto)
  @ApiErrors(400)
  @Get('manage/businesses/:businessId/reviews')
  reviews(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Query() q: PortalReviewQueryDto,
  ) {
    return this.portal.reviews(user, id, q);
  }

  @ApiOperation({
    summary:
      'Profile link, neutral review link and "See our reviews on TalkGround" badge',
  })
  @ApiData(ShareLinksDto)
  @Get('manage/businesses/:businessId/share-links')
  share(@CurrentUser() user: AuthUser, @Param('businessId', uuid) id: string) {
    return this.portal.shareLinks(user, id);
  }

  @ApiOperation({ summary: 'My reports and disputes, with outcomes' })
  @ApiData(IssuesDto)
  @Get('manage/businesses/:businessId/issues')
  issues(@CurrentUser() user: AuthUser, @Param('businessId', uuid) id: string) {
    return this.portal.issues(user, id);
  }

  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Post the response to a review (one per review). Shown as "Response from <business>".',
  })
  @ApiData(OwnResponseDto, { status: 201 })
  @ApiErrors(400, 404, 409)
  @Post('manage/businesses/:businessId/reviews/:reviewId/response')
  respond(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Param('reviewId', uuid) reviewId: string,
    @Body() dto: ResponseBodyDto,
  ) {
    return this.portal.respond(user, id, reviewId, dto.body);
  }

  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  @ApiOperation({
    summary: 'Edit the response (versioned; the latest is shown)',
  })
  @ApiData(OwnResponseDto)
  @ApiErrors(400, 404)
  @Patch('manage/businesses/:businessId/reviews/:reviewId/response')
  editResponse(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Param('reviewId', uuid) reviewId: string,
    @Body() dto: ResponseBodyDto,
  ) {
    return this.portal.editResponse(user, id, reviewId, dto.body);
  }

  @ApiOperation({
    summary: 'Propose a resolution (only the reviewer can mark it resolved)',
  })
  @ApiData(ResolutionDto, { status: 201 })
  @ApiErrors(400, 404)
  @Post('manage/businesses/:businessId/reviews/:reviewId/resolution')
  propose(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Param('reviewId', uuid) reviewId: string,
    @Body() dto: ProposeResolutionDto,
  ) {
    return this.portal.proposeResolution(user, id, reviewId, dto);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Dispute a review with a written reason (the review is preserved; staff decide)',
  })
  @ApiData(DisputeCreatedDto, { status: 201 })
  @ApiErrors(400, 404, 409)
  @Post('manage/businesses/:businessId/reviews/:reviewId/disputes')
  dispute(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Param('reviewId', uuid) reviewId: string,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.portal.dispute(user, id, reviewId, dto);
  }
}
