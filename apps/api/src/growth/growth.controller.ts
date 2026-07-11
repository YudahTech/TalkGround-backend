import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GrowthService } from './growth.service';
import { SurveyResponseDto, WaitlistDto } from './growth.dto';
import { Public } from '../common/decorators';
import { Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';
import { SWAGGER_BEARER_AUTH } from '../common/swagger';

@ApiTags('Growth')
@Controller()
export class GrowthController {
  constructor(private growth: GrowthService) {}

  @Public()
  @ApiOperation({ summary: 'Submit pre-launch survey (public)' })
  @Post('survey/responses')
  submitSurvey(@Body() dto: SurveyResponseDto) {
    return this.growth.submitSurvey(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Join waitlist (public)' })
  @Post('waitlist')
  joinWaitlist(@Body() dto: WaitlistDto) {
    return this.growth.joinWaitlist(dto);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Waitlist stats (admin JWT)' })
  @Get('waitlist/stats')
  waitlistStats() {
    return this.growth.waitlistStats();
  }
}
