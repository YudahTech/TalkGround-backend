import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IdentifierInputDto } from '../businesses/businesses.dto';
import { PaginationQueryDto } from '../common/pagination';

export class CreateSubmissionDto {
  @ApiProperty({ example: 'Mama Put Kitchen' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({
    example: 'food-restaurants',
    description: 'Category slug (GET /categories)',
  })
  @IsString()
  @MaxLength(60)
  category: string;

  @ApiPropertyOptional({
    example: 'Home-style Nigerian food with delivery around Yaba.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://mamaput.ng' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'] })
  @MaxLength(300)
  website?: string;

  @ApiPropertyOptional({ example: 'lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Yaba' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiPropertyOptional({ example: '3 Herbert Macaulay Way' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @ApiPropertyOptional({
    type: [IdentifierInputDto],
    description:
      'Instagram/TikTok handles, phone, etc. Helps us avoid duplicates.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => IdentifierInputDto)
  identifiers?: IdentifierInputDto[];

  @ApiPropertyOptional({
    default: false,
    description: 'true = I own or run this business (owner submission)',
  })
  @IsOptional()
  @IsBoolean()
  isOwner?: boolean;

  @ApiPropertyOptional({
    example: 'Founder',
    description: 'Required when isOwner is true',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ownerRole?: string;
}

export class SubmissionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['pending_review', 'approved', 'rejected', 'merged'],
  })
  @IsOptional()
  @IsIn(['pending_review', 'approved', 'rejected', 'merged'])
  status?: 'pending_review' | 'approved' | 'rejected' | 'merged';
}

export class ApproveSubmissionDto {
  @ApiPropertyOptional({ description: 'Override the submitted name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Override the submitted category slug' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'false creates the listing in pending_review',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectSubmissionDto {
  @ApiProperty({
    example: 'We could not find any public information about this business.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  note: string;
}

export class MergeSubmissionDto {
  @ApiProperty({ description: 'Existing business the submission duplicates' })
  @IsUUID()
  businessId: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
