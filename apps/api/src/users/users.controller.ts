import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Public } from '../common/decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { UpdateProfileDto } from './users.dto';
import { SWAGGER_BEARER_AUTH } from '../common/swagger';

/**
 * Paths (all under global prefix /api/v1):
 * - GET/PATCH /users/me
 * - GET /users/me/dashboard
 * - GET /users/me/reviews
 * - GET /users/:username (public)
 */
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @ApiTags('Users — Me (JWT)')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({
    summary: 'GET /users/me — Current user profile',
    description:
      'Requires JWT. Login → Authorize (paste accessToken) → Execute. Returns your profile only.',
  })
  @Get('me')
  getMe(@CurrentUser() user: { id: string }) {
    return this.users.getMe(user.id);
  }

  @ApiTags('Users — Me (JWT)')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({
    summary: 'PATCH /users/me — Update my profile',
    description: 'Requires JWT. Partial update: displayName, bio, avatarUrl, city, interests.',
  })
  @ApiBody({ type: UpdateProfileDto })
  @Patch('me')
  updateMe(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(user.id, dto);
  }

  @ApiTags('Users — Me (JWT)')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({
    summary: 'GET /users/me/dashboard — My dashboard stats',
    description:
      'Requires JWT. Returns stats (totalReviews, helpfulVotes, views) + recentReviews.',
  })
  @Get('me/dashboard')
  getDashboard(@CurrentUser() user: { id: string }) {
    return this.users.getDashboard(user.id);
  }

  @ApiTags('Users — Me (JWT)')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({
    summary: 'GET /users/me/reviews — All my reviews',
    description: 'Requires JWT. Lists every review you wrote (except removed).',
  })
  @Get('me/reviews')
  getMyReviews(@CurrentUser() user: { id: string }) {
    return this.users.getMyReviews(user.id);
  }

  @Public()
  @ApiTags('Users — Public')
  @ApiOperation({
    summary: 'GET /users/{username} — Public profile',
    description:
      'No JWT. Example username after seed: chinedu_okafor. Do not confuse with /users/me.',
  })
  @ApiParam({
    name: 'username',
    example: 'chinedu_okafor',
    description: 'Public username (not "me")',
  })
  @Get(':username')
  getProfile(@Param('username') username: string) {
    return this.users.getPublicProfile(username);
  }
}
