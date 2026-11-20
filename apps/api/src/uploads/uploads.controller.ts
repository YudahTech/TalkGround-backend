import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiData, ApiErrors } from '../common/api-response';
import { UploadSignatureResponseDto } from './uploads.responses';
import { ApiCookieAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { UploadSignatureDto } from './uploads.dto';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';

@ApiTags('Uploads')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('uploads')
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  @ApiOperation({
    summary:
      'Signed Cloudinary upload params. POST the file plus every key in data.params to data.uploadUrl. 503 when uploads are not configured.',
  })
  @ApiBody({ type: UploadSignatureDto })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiData(UploadSignatureResponseDto, { status: 201 })
  @ApiErrors(400, 401, 429, 503)
  @Post('signature')
  getSignature(@Body() dto: UploadSignatureDto) {
    return {
      data: this.uploads.getSignature(dto.folder),
    };
  }
}
