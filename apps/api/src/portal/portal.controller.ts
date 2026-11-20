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
  IdentifierInputDto,
  ManageBusinessDto,
} from '../businesses/businesses.dto';
import { PortalService } from './portal.service';
import {
  CreateDisputeDto,
  PortalReviewQueryDto,
  ProposeResolutionDto,
  ResponseBodyDto,
} from './portal.dto';

const MINUTE = 60_000;
const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Business representative area. Every route checks that the caller actively manages
 * :businessId (BusinessAccessService.assertManager) — a staff role does not grant this.
 */
@ApiTags('Business portal (owners)')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller()
export class PortalController {
  constructor(private portal: PortalService) {}

  @ApiOperation({ summary: 'Businesses I manage' })
  @Get('users/me/businesses')
  mine(@CurrentUser() user: AuthUser) {
    return this.portal.myBusinesses(user.id);
  }

  @ApiOperation({
    summary:
      'Management view of my business (all identifiers, editable fields)',
  })
  @Get('manage/businesses/:businessId')
  view(@CurrentUser() user: AuthUser, @Param('businessId', uuid) id: string) {
    return this.portal.managementView(user, id);
  }

  @ApiOperation({
    summary: 'Update permitted profile information (not name or category)',
  })
  @Patch('manage/businesses/:businessId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Body() dto: ManageBusinessDto,
  ) {
    return this.portal.updateProfile(user, id, dto);
  }

  @ApiOperation({
    summary:
      'Add a public business link (social handle, website, phone, email)',
  })
  @Post('manage/businesses/:businessId/identifiers')
  addIdentifier(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Body() dto: IdentifierInputDto,
  ) {
    return this.portal.addIdentifier(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a public business link' })
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
      'Dashboard: rating, distribution, dimensions, response activity, unresolved complaints, 6-month trend, share links',
  })
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
  @Get('manage/businesses/:businessId/reviews')
  reviews(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) id: string,
    @Query() q: PortalReviewQueryDto,
  ) {
    return this.portal.reviews(user, id, q);
  }

  @ApiOperation({
    summary: 'Shareable profile and neutral review-invitation links',
  })
  @Get('manage/businesses/:businessId/share-links')
  share(@CurrentUser() user: AuthUser, @Param('businessId', uuid) id: string) {
    return this.portal.shareLinks(user, id);
  }

  @ApiOperation({ summary: 'My reports and disputes, with outcomes' })
  @Get('manage/businesses/:businessId/issues')
  issues(@CurrentUser() user: AuthUser, @Param('businessId', uuid) id: string) {
    return this.portal.issues(user, id);
  }

  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  @ApiOperation({
    summary: 'Post the official response to a review (one per review)',
  })
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
    summary:
      'Edit the official response (limited edits; previous versions kept)',
  })
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
      'Dispute a review (staff decide; the business cannot delete reviews)',
  })
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
