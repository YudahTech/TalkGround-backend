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
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  IdentifierInputDto,
  LocationFieldsDto,
} from '../businesses/businesses.dto';
import { PaginationQueryDto } from '../common/pagination';

export class CreateSubmissionDto extends LocationFieldsDto {
  @ApiProperty({ example: 'Mama Put Kitchen' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({
    example: 'food-and-restaurants',
    description: 'Category slug (GET /categories)',
  })
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
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

  @ApiPropertyOptional({
    type: [IdentifierInputDto],
    description: 'Instagram/TikTok handles, phone… helps spot duplicates.',
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
    default: 'pending_review',
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
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({
    description:
      'Factual description written from supplied or verified information (PRD §7.13). Overrides the submitted one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

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
