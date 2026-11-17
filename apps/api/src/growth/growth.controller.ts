import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { GrowthService } from './growth.service';
import { SurveyResponseDto, WaitlistDto } from './growth.dto';
import { Public, Roles } from '../common/decorators';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';

@ApiTags('Growth')
@Controller()
export class GrowthController {
  constructor(private growth: GrowthService) {}

  @Public()
  @ApiOperation({ summary: 'Submit pre-launch survey (public)' })
  @ApiBody({ type: SurveyResponseDto })
  @Post('survey/responses')
  submitSurvey(@Body() dto: SurveyResponseDto) {
    return this.growth.submitSurvey(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Join waitlist (public)' })
  @ApiBody({ type: WaitlistDto })
  @Post('waitlist')
  joinWaitlist(@Body() dto: WaitlistDto) {
    return this.growth.joinWaitlist(dto);
  }

  @Roles(UserRole.ADMIN)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({ summary: 'Waitlist stats (admin JWT)' })
  @Get('waitlist/stats')
  waitlistStats() {
    return this.growth.waitlistStats();
  }
}
