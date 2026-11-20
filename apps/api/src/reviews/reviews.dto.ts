import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EvidenceType, ReportReason } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';
import { toUpperCase } from '../common/transforms';

export class DimensionValueDto {
  @ApiProperty({
    example: 'delivery',
    description: 'Dimension key from GET /categories/:slug',
  })
  @IsString()
  @MaxLength(60)
  key: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  value: number;
}

export class CreateReviewDto {
  @ApiProperty()
  @IsUUID()
  businessId: string;

  @ApiProperty({
    example: 4,
    minimum: 1,
    maximum: 5,
    description: 'Always required',
  })
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating: number;

  @ApiPropertyOptional({
    type: [DimensionValueDto],
    description:
      "The category's dimensions: required ones must be rated; optional ones may be skipped.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DimensionValueDto)
  dimensions?: DimensionValueDto[];

  @ApiProperty({
    example: 'Great fabric, slow delivery',
    minLength: 3,
    maxLength: 120,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiProperty({
    example:
      'Ordered two dresses on Instagram. The fabric quality was excellent but delivery took 9 days instead of 3. They kept me updated on WhatsApp throughout.',
    description:
      'Between REVIEW_BODY_MIN_LENGTH (default 50, see GET /meta/config) and 5000 characters',
  })
  @IsString()
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Would you recommend this business?',
  })
  @IsOptional()
  @IsBoolean()
  recommend?: boolean;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating?: number;

  @ApiPropertyOptional({
    type: [DimensionValueDto],
    description: 'Replaces all dimension ratings',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DimensionValueDto)
  dimensions?: DimensionValueDto[];

  @ApiPropertyOptional({ minLength: 3, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  recommend?: boolean;
}

export class AddEvidenceDto {
  @ApiProperty({
    enum: EvidenceType,
    example: EvidenceType.RECEIPT,
    description:
      'PHOTO is public (upload folder "evidence"). RECEIPT is private (upload folder "receipts").',
  })
  @Transform(toUpperCase)
  @IsEnum(EvidenceType)
  type: EvidenceType;

  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/authenticated/v1/talkground/receipts/abc.jpg',
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url: string;
}

export class ReportDto {
  @ApiProperty({
    enum: ReportReason,
    example: ReportReason.FAKE_OR_NEVER_VISITED,
  })
  @Transform(toUpperCase)
  @IsEnum(ReportReason)
  reasonCode: ReportReason;

  @ApiPropertyOptional({
    example: 'We have no record of this order.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ConsumerResolutionDto {
  @ApiProperty({
    enum: ['resolved', 'reopened'],
    description:
      'resolved = you report the complaint resolved; reopened = it is not resolved after all.',
  })
  @IsIn(['resolved', 'reopened'])
  status: 'resolved' | 'reopened';

  @ApiPropertyOptional({ example: 'They refunded me in full.', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MyReviewsQueryDto extends PaginationQueryDto {}
