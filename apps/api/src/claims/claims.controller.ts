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
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminPermission } from '@prisma/client';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';
import { PaginationQueryDto } from '../common/pagination';
import { ClaimsService } from './claims.service';
import {
  AddClaimDocumentDto,
  ApproveClaimDto,
  ClaimListQueryDto,
  ConfirmClaimCodeDto,
  CreateClaimDto,
  RejectClaimDto,
  SetOwnershipDto,
} from './claims.dto';

const MINUTE = 60_000;
const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Ownership claims')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller()
export class ClaimsController {
  constructor(private claims: ClaimsService) {}

  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @ApiOperation({
    summary: 'Claim a business (verified email required)',
    description:
      'Returns instructions for the chosen method. Staff review every claim. ' +
      'Approval gives access to the business dashboard; it does not mean TalkGround endorses the business.',
  })
  @Post('businesses/:businessId/claims')
  create(
    @CurrentUser() user: AuthUser,
    @Param('businessId', uuid) businessId: string,
    @Body() dto: CreateClaimDto,
  ) {
    return this.claims.create(user, businessId, dto);
  }

  @ApiOperation({ summary: 'My ownership claims' })
  @Get('users/me/claims')
  mine(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.claims.mine(user.id, q.page, q.limit);
  }

  @ApiOperation({ summary: 'One of my claims, with verification instructions' })
  @Get('claims/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.claims.getForClaimant(user, id);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({ summary: 'BUSINESS_EMAIL: confirm the 6-digit code' })
  @Post('claims/:id/verify-email')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ConfirmClaimCodeDto,
  ) {
    return this.claims.confirmEmailCode(user, id, dto.code);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: MINUTE } })
  @ApiOperation({ summary: 'BUSINESS_EMAIL: send a new code' })
  @Post('claims/:id/resend-code')
  resend(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.claims.resendEmailCode(user, id);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({ summary: 'WEBSITE_DOMAIN: check for the DNS TXT record' })
  @Post('claims/:id/check-domain')
  checkDomain(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.claims.checkDomain(user, id);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Attach a private supporting document (upload to folder "claim-documents" first)',
  })
  @Post('claims/:id/documents')
  addDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AddClaimDocumentDto,
  ) {
    return this.claims.addDocument(user, id, dto);
  }

  @ApiOperation({ summary: 'Cancel my pending claim' })
  @Delete('claims/:id')
  cancel(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.claims.cancel(user, id);
  }
}

@ApiTags('Admin — claims & ownership')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@RequirePermissions(AdminPermission.CLAIMS_REVIEW)
@Controller('admin')
export class ClaimsAdminController {
  constructor(private claims: ClaimsService) {}

  @ApiOperation({ summary: 'Claim queue (default: pending, oldest first)' })
  @Get('claims')
  list(@Query() q: ClaimListQueryDto) {
    return this.claims.list(q.status, q.page, q.limit);
  }

  @ApiOperation({
    summary:
      'Claim detail. Document links (10-minute signed URLs) need CLAIM_DOCUMENTS_VIEW; viewing is audited.',
  })
  @Get('claims/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.claims.detail(user, id);
  }

  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve: grant management ("claimed") or mark ownership verified',
  })
  @Post('claims/:id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ApproveClaimDto,
  ) {
    return this.claims.approve(user, id, dto);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Reject with a reason (sent to the claimant)' })
  @Post('claims/:id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectClaimDto,
  ) {
    return this.claims.reject(user, id, dto);
  }

  @ApiOperation({
    summary:
      'Change ownership status directly (unclaimed revokes all managers)',
  })
  @Patch('businesses/:id/ownership')
  setOwnership(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: SetOwnershipDto,
  ) {
    return this.claims.setOwnership(user, id, dto);
  }
}
