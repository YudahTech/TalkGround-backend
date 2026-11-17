import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UploadSignatureDto {
  @ApiProperty({
    enum: ['reviews', 'receipts', 'brands', 'avatars'],
    example: 'reviews',
    description:
      'Cloudinary folder under revyu/. receipts are private (type=authenticated). POST every key in data.params with the file.',
  })
  @IsIn(['reviews', 'receipts', 'brands', 'avatars'])
  folder: 'reviews' | 'receipts' | 'brands' | 'avatars';
}
