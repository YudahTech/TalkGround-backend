import { IsIn, IsString } from 'class-validator';

export class UploadSignatureDto {
  @IsIn(['reviews', 'receipts', 'brands'])
  folder: 'reviews' | 'receipts' | 'brands';
}
