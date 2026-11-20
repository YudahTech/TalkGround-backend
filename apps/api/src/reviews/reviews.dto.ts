import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
import { EvidenceKind, ReportReason } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

export class DimensionScoreDto {
  @ApiProperty({
    example: 'communication',
    description: 'Dimension key from GET /categories/:slug',
  })
  @IsString()
  @MaxLength(60)
  key: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;
}

export class CreateReviewDto {
  @ApiProperty({ example: '7a1c2c1e-2a0b-4a7d-9a43-8a1f1f7a9b10' })
  @IsUUID()
  businessId: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating: number;

  @ApiPropertyOptional({
    type: [DimensionScoreDto],
    description:
      "Scores for the category's rating dimensions. Required dimensions must be included; optional ones may be skipped.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DimensionScoreDto)
  dimensions?: DimensionScoreDto[];

  @ApiPropertyOptional({
    example: 'Great fabric, slow delivery',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiProperty({
    example:
      'Ordered two dresses on Instagram. The fabric quality was excellent but delivery took 9 days instead of 3. They kept me updated on WhatsApp.',
    minLength: 30,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(30)
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({
    example: '2026-11-02',
    description: 'When the experience happened',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  experienceDate?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Set to true to review a NEW experience with a business you already reviewed (allowed after the repeat period). Your earlier review stays visible as an earlier experience.',
  })
  @IsOptional()
  @IsBoolean()
  newExperience?: boolean;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating?: number;

  @ApiPropertyOptional({
    type: [DimensionScoreDto],
    description: 'Replaces all dimension scores',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DimensionScoreDto)
  dimensions?: DimensionScoreDto[];

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ minLength: 30, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MinLength(30)
  @MaxLength(5000)
  body?: string;

  @ApiPropertyOptional({ example: '2026-11-02' })
  @IsOptional()
  @IsDateString({ strict: true })
  experienceDate?: string;
}

export class AddEvidenceDto {
  @ApiProperty({
    enum: EvidenceKind,
    example: EvidenceKind.RECEIPT,
    description:
      'PHOTO is public (upload to folder "evidence"). RECEIPT, SCREENSHOT and DOCUMENT are private (folder "evidence-private").',
  })
  @Transform(upper)
  @IsEnum(EvidenceKind)
  kind: EvidenceKind;

  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/authenticated/v1/talkground/evidence-private/abc.jpg',
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url: string;
}

export class VoteDto {
  @ApiProperty({
    example: true,
    description: 'true = helpful, false = not helpful',
  })
  @IsBoolean()
  helpful: boolean;
}

export class ReportReviewDto {
  @ApiProperty({ enum: ReportReason, example: ReportReason.FALSE_EXPERIENCE })
  @Transform(upper)
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({
    example:
      'This person was never our customer — no order under this name or number.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ConsumerResolutionDto {
  @ApiProperty({
    enum: ['resolved', 'reopened'],
    description:
      'resolved = you report the issue was resolved; reopened = the issue is not resolved after all.',
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
