import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { BrandCategory, City, ReportReason } from '@prisma/client';

export class CreateBrandDto {
  @ApiProperty({ example: "Nexxa's Kitchen" })
  @IsString()
  name: string;

  @ApiProperty({ example: 'nexxas-kitchen' })
  @IsString()
  slug: string;

  @ApiPropertyOptional({ example: 'Authentic Nigerian cuisine in VI.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/demo/logo.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty({ enum: BrandCategory, example: BrandCategory.RESTAURANTS })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(BrandCategory)
  category: BrandCategory;

  @ApiPropertyOptional({ example: 'buka' })
  @IsOptional()
  @IsString()
  subType?: string;

  @ApiProperty({ enum: City, example: City.LAGOS })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city: City;

  @ApiPropertyOptional({
    type: [String],
    example: ['Dining', 'Local Cuisine'],
  })
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ example: 'Victoria Island' })
  @IsString()
  area: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Admin only — claimed business badge (+10 trust)',
  })
  @IsOptional()
  @IsBoolean()
  claimed?: boolean;
}

export class UpdateBrandDto {
  @ApiPropertyOptional({ example: "Nexxa's Kitchen" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'nexxas-kitchen' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ enum: BrandCategory })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(BrandCategory)
  category?: BrandCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subType?: string;

  @ApiPropertyOptional({ enum: City })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city?: City;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Admin only. Set true after offline verification. No public claim API in v1.',
  })
  @IsOptional()
  @IsBoolean()
  claimed?: boolean;
}

export class BrandQueryDto {
  @ApiPropertyOptional({ example: 'jollof', description: 'Search name/area' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    example: 'lagos',
    description: 'Use lowercase in query: lagos | abuja',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: 'restaurants',
    description: 'lowercase: restaurants | hotels',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({
    enum: ['rating', 'review_count', 'most_reviewed', 'newest'],
    example: 'rating',
  })
  @IsOptional()
  @IsString()
  sort?: 'rating' | 'review_count' | 'most_reviewed' | 'newest';

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 9, default: 9, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ListBrandReviewsQueryDto {
  @ApiPropertyOptional({
    enum: ['recent', 'rating_high', 'rating_low', 'helpful', 'verified_first'],
    default: 'recent',
  })
  @IsOptional()
  @IsIn(['recent', 'rating_high', 'rating_low', 'helpful', 'verified_first'])
  sort?: 'recent' | 'rating_high' | 'rating_low' | 'helpful' | 'verified_first' =
    'recent';

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class CreateReviewDto {
  @ApiProperty({
    example: '546622e9-8b36-4a21-90cb-4262418f0698',
    description: 'Brand UUID from GET /brands/:slug → data.id',
  })
  @IsString()
  brandId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'Best pepper soup in VI', minLength: 3 })
  @IsString()
  @MinLength(3)
  title: string;

  @ApiProperty({
    example:
      'Visited on a Friday evening with colleagues. The pepper soup was rich and spicy, jollof portion was generous, and service was warm.',
    minLength: 50,
  })
  @IsString()
  @MinLength(50)
  body: string;

  @ApiPropertyOptional({ example: 'Fast service, great jollof' })
  @IsOptional()
  @IsString()
  pros?: string;

  @ApiPropertyOptional({ example: 'Can get crowded on weekends' })
  @IsOptional()
  @IsString()
  cons?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  recommend: boolean;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ minLength: 50 })
  @IsOptional()
  @IsString()
  @MinLength(50)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pros?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cons?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  recommend?: boolean;
}

export class ReportReviewDto {
  @ApiProperty({
    enum: ReportReason,
    example: ReportReason.FAKE_SPAM,
  })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({ example: 'Looks like a fake review' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class AddMediaDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  })
  @IsString()
  url: string;

  @ApiProperty({ enum: ['photo', 'receipt'], example: 'photo' })
  @IsString()
  type: 'photo' | 'receipt';
}

export class BrandSuggestionDto {
  @ApiProperty({ example: 'Mama Put Joint' })
  @IsString()
  name: string;

  @ApiProperty({ enum: BrandCategory, example: BrandCategory.RESTAURANTS })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(BrandCategory)
  category: BrandCategory;

  @ApiPropertyOptional({ example: 'casual' })
  @IsOptional()
  @IsString()
  subType?: string;

  @ApiProperty({ enum: City, example: City.LAGOS })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city: City;

  @ApiProperty({ example: 'Yaba' })
  @IsString()
  area: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  website?: string;
}
