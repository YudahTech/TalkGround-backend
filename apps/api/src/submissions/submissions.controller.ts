import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { PERMISSIONS, RequirePermissions } from '../common/permissions';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';
import { PaginationQueryDto } from '../common/pagination';
import { ApiData, ApiErrors, ApiPaged } from '../common/api-response';
import { SubmissionsService } from './submissions.service';
import {
  ApproveSubmissionDto,
  CreateSubmissionDto,
  MergeSubmissionDto,
  RejectSubmissionDto,
  SubmissionListQueryDto,
} from './submissions.dto';
import {
  AdminSubmissionDetailDto,
  AdminSubmissionDto,
  SubmissionCreatedDto,
  SubmissionDecisionDto,
  SubmissionDto,
} from './submissions.responses';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Business submissions')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller()
export class SubmissionsController {
  constructor(private submissions: SubmissionsService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Suggest a missing business, or submit your own (isOwner: true)',
    description:
      'Search first. The response lists possibleMatches (show "Is it one of these?"). Staff check every submission before anything is published.',
  })
  @ApiData(SubmissionCreatedDto, { status: 201 })
  @ApiErrors(400, 401, 403)
  @Post('business-submissions')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSubmissionDto) {
    return this.submissions.create(user, dto);
  }

  @ApiOperation({ summary: 'My submissions and their status' })
  @ApiPaged(SubmissionDto)
  @ApiErrors(401)
  @Get('users/me/business-submissions')
  mine(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.submissions.mine(user.id, q.page, q.limit);
  }
}

@ApiTags('Admin — submissions')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@RequirePermissions(PERMISSIONS.SUGGESTION_RESOLVE)
@ApiErrors(401, 403)
@Controller('admin/submissions')
export class SubmissionsAdminController {
  constructor(private submissions: SubmissionsService) {}

  @ApiOperation({
    summary:
      'Submission queue (default: pending_review, oldest first) — suggestion.resolve',
  })
  @ApiPaged(AdminSubmissionDto)
  @Get()
  list(@Query() q: SubmissionListQueryDto) {
    return this.submissions.list(q.status, q.page, q.limit);
  }

  @ApiOperation({ summary: 'One submission with possible duplicates' })
  @ApiData(AdminSubmissionDetailDto)
  @ApiErrors(404)
  @Get(':id')
  detail(@Param('id', uuid) id: string) {
    return this.submissions.detail(id);
  }

  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve: create the listing (published unless publish=false)',
  })
  @ApiData(SubmissionDecisionDto)
  @ApiErrors(400, 404, 409)
  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ApproveSubmissionDto,
  ) {
    return this.submissions.approve(user, id, dto);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Reject with a reason (visible to the submitter)' })
  @ApiData(SubmissionDecisionDto)
  @ApiErrors(400, 404, 409)
  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectSubmissionDto,
  ) {
    return this.submissions.reject(user, id, dto);
  }

  @HttpCode(200)
  @ApiOperation({
    summary: 'Duplicate of an existing listing: add its identifiers there',
  })
  @ApiData(SubmissionDecisionDto)
  @ApiErrors(400, 404, 409)
  @Post(':id/merge')
  merge(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: MergeSubmissionDto,
  ) {
    return this.submissions.merge(user, id, dto);
  }
}
