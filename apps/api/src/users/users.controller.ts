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
import { UsersService } from './users.service';
import { DeleteAccountDto, UpdateProfileDto } from './users.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'My account (includes isStaff / permissions for staff)',
  })
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Update my profile (display name, bio, avatar, public location)',
  })
  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(user.id, dto);
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Download all my data (NDPA right of access)' })
  @Get('me/export')
  export(@CurrentUser() user: AuthUser) {
    return this.users.exportMe(user.id);
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Delete my account (NDPA). Requires current password. Irreversible.',
  })
  @Delete('me')
  delete(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.users.deleteMe(user.id, dto.password);
  }

  @Public()
  @ApiOperation({
    summary: 'Public reviewer profile (only what the user chose to show)',
  })
  @Get(':username')
  publicProfile(@Param('username') username: string) {
    return this.users.getPublicProfile(username);
  }
}
