import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UploadSignatureDto {
  @ApiProperty({
    enum: ['reviews', 'receipts', 'brands'],
    example: 'reviews',
    description: 'Cloudinary folder group under revyu/',
  })
  @IsIn(['reviews', 'receipts', 'brands'])
  folder: 'reviews' | 'receipts' | 'brands';
}
