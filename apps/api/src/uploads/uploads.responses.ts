import { ApiProperty } from '@nestjs/swagger';

export class UploadSignatureResponseDto {
  @ApiProperty() cloudName: string;
  @ApiProperty() apiKey: string;
  @ApiProperty() timestamp: number;
  @ApiProperty() signature: string;
  @ApiProperty({ example: 'talkground/receipts' }) folder: string;
  @ApiProperty() uploadUrl: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Send every key with the file',
  })
  params: Record<string, string | number>;
  @ApiProperty({ example: 5242880 }) maxBytes: number;
  @ApiProperty({ type: [String], example: ['jpg', 'jpeg', 'png', 'webp'] })
  allowedFormats: string[];
}
