import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Chinedu Okafor',
    minLength: 2,
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({
    example: 'I review gadget shops so you do not get burnt.',
    maxLength: 280,
  })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/talkground/avatars/abc.jpg',
    description:
      'Upload with POST /uploads/signature (folder "avatars") first. Empty string removes it.',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: false })
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({
    example: 'Lagos',
    description:
      'Shown on your public profile. Leave empty to hide. Never use your home address.',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  location?: string;
}

export class DeleteAccountDto {
  @ApiProperty({
    example: 'myCurrentPassword',
    description: 'Current password, to confirm',
  })
  @IsString()
  @MaxLength(72)
  password: string;
}
