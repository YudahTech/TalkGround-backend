import { Body, Controller, Post } from '@nestjs/common';
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
      'Cloudinary signed upload params (JWT). Requires CLOUDINARY_* env vars.',
  })
  @ApiBody({ type: UploadSignatureDto })
  @Post('signature')
  getSignature(@Body() dto: UploadSignatureDto) {
    return {
      data: this.uploads.getSignature(dto.folder),
    };
  }
}
