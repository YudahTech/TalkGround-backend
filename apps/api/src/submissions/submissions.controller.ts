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
import { AdminPermission } from '@prisma/client';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';
import { PaginationQueryDto } from '../common/pagination';
import { SubmissionsService } from './submissions.service';
import {
  ApproveSubmissionDto,
  CreateSubmissionDto,
  MergeSubmissionDto,
  RejectSubmissionDto,
  SubmissionListQueryDto,
} from './submissions.dto';

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
      'Search first. Returns 409 with the existing listing when a handle/website/phone already belongs to one. ' +
      'The submission is checked by staff before anything is published.',
  })
  @Post('business-submissions')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSubmissionDto) {
    return this.submissions.create(user, dto);
  }

  @ApiOperation({ summary: 'My submissions and their status' })
  @Get('users/me/business-submissions')
  mine(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.submissions.mine(user.id, q.page, q.limit);
  }
}

@ApiTags('Admin — submissions')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@RequirePermissions(AdminPermission.SUBMISSIONS_REVIEW)
@Controller('admin/submissions')
export class SubmissionsAdminController {
  constructor(private submissions: SubmissionsService) {}

  @ApiOperation({
    summary: 'Submission queue (default: pending_review, oldest first)',
  })
  @Get()
  list(@Query() q: SubmissionListQueryDto) {
    return this.submissions.list(q.status, q.page, q.limit);
  }

  @ApiOperation({ summary: 'One submission with duplicate candidates' })
  @Get(':id')
  detail(@Param('id', uuid) id: string) {
    return this.submissions.detail(id);
  }

  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve: create the listing (published unless publish=false)',
  })
  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ApproveSubmissionDto,
  ) {
    return this.submissions.approve(user, id, dto);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Reject with a reason (sent to the submitter)' })
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
  @Post(':id/merge')
  merge(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: MergeSubmissionDto,
  ) {
    return this.submissions.merge(user, id, dto);
  }
}
