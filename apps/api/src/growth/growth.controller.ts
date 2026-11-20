import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, RequirePermissions } from '../common/permissions';
import { ApiErrors } from '../common/api-response';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { GrowthService } from './growth.service';
import { SurveyResponseDto, WaitlistDto } from './growth.dto';
import { Public } from '../common/decorators';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';

@ApiTags('Growth')
@Controller()
export class GrowthController {
  constructor(private growth: GrowthService) {}

  @Public()
  @ApiOperation({ summary: 'Submit pre-launch survey (public)' })
  @ApiBody({ type: SurveyResponseDto })
  @ApiCreatedResponse({
    schema: {
      properties: {
        data: {
          type: 'object',
          properties: { id: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
  })
  @ApiErrors(400, 429)
  @Post('survey/responses')
  submitSurvey(@Body() dto: SurveyResponseDto) {
    return this.growth.submitSurvey(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Join waitlist (public)' })
  @ApiBody({ type: WaitlistDto })
  @ApiCreatedResponse({
    schema: {
      properties: {
        data: {
          type: 'object',
          properties: { id: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
  })
  @ApiErrors(400, 409, 429)
  @Post('waitlist')
  joinWaitlist(@Body() dto: WaitlistDto) {
    return this.growth.joinWaitlist(dto);
  }

  @RequirePermissions(PERMISSIONS.AUDITLOG_EXPORT)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({ summary: 'Waitlist stats — auditlog.export' })
  @ApiOkResponse({
    schema: {
      properties: {
        data: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            byCity: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @ApiErrors(401, 403)
  @Get('waitlist/stats')
  waitlistStats() {
    return this.growth.waitlistStats();
  }
}
