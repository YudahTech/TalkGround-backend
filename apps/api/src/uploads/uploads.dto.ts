import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { UPLOAD_FOLDERS } from './uploads.service';
import type { UploadFolder } from './uploads.service';

export class UploadSignatureDto {
  @ApiProperty({
    enum: UPLOAD_FOLDERS,
    example: 'evidence',
    description:
      'evidence = public review photos; receipts = review receipts (private); ' +
      'logos = business logos; avatars = profile photos; claim-documents = ownership documents (private). ' +
      'POST every key in data.params with the file to data.uploadUrl.',
  })
  @IsIn(UPLOAD_FOLDERS)
  folder: UploadFolder;
}
