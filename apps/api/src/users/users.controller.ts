import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';
import { ApiData, ApiErrors, ApiMessage } from '../common/api-response';
import { UsersService } from './users.service';
import { DeleteAccountDto, UpdateProfileDto } from './users.dto';
import { AccountDto, DataExportDto, PublicProfileDto } from './users.responses';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'My account (isStaff, staffRole and permissions for staff)',
  })
  @ApiData(AccountDto)
  @ApiErrors(401)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Update my profile (display name, bio, avatar, public location)',
  })
  @ApiData(AccountDto)
  @ApiErrors(400, 401)
  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(user.id, dto);
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Download all my data (NDPA)' })
  @ApiData(DataExportDto)
  @ApiErrors(401, 429)
  @Get('me/export')
  export(@CurrentUser() user: AuthUser) {
    return this.users.exportMe(user.id);
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Delete my account (NDPA). Requires the current password. Irreversible.',
  })
  @ApiMessage()
  @ApiErrors(400, 401, 429)
  @Delete('me')
  delete(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.users.deleteMe(user.id, dto.password);
  }

  @Public()
  @ApiOperation({
    summary: 'Public reviewer profile (only what the user chose to show)',
  })
  @ApiData(PublicProfileDto)
  @ApiErrors(404)
  @Get(':username')
  publicProfile(@Param('username') username: string) {
    return this.users.getPublicProfile(username);
  }
}
