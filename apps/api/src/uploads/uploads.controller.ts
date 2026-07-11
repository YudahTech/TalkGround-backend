import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { UploadSignatureDto } from './uploads.dto';
import { SWAGGER_BEARER_AUTH } from '../common/swagger';

@ApiTags('Uploads')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller('uploads')
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  @ApiOperation({
    summary: 'Cloudinary signed upload params (JWT). Requires CLOUDINARY_* env vars.',
  })
  @Post('signature')
  getSignature(@Body() dto: UploadSignatureDto) {
    return {
      data: this.uploads.getSignature(dto.folder),
    };
  }
}
