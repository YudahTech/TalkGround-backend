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
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(BrandCategory)
  category: BrandCategory;

  @IsOptional()
  @IsString()
  subType?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city: City;

  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  area: string;

  /** Only settable by ADMIN via create/update — never by public users */
  @IsOptional()
  @IsBoolean()
  claimed?: boolean;
}

/** Admin PATCH body — all fields optional; `claimed` is admin-only */
export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(BrandCategory)
  category?: BrandCategory;

  @IsOptional()
  @IsString()
  subType?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city?: City;

  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  area?: string;

  /**
   * Claimed badge: ONLY Revyu admins may set this.
   * There is no public “claim my business” endpoint in v1.
   * Set true after offline verification (call / email / docs).
   */
  @IsOptional()
  @IsBoolean()
  claimed?: boolean;
}

export class BrandQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @IsString()
  sort?: 'rating' | 'review_count' | 'most_reviewed' | 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Query params for GET /brands/:slug/reviews */
export class ListBrandReviewsQueryDto {
  @IsOptional()
  @IsIn(['recent', 'rating_high', 'rating_low', 'helpful', 'verified_first'])
  sort?: 'recent' | 'rating_high' | 'rating_low' | 'helpful' | 'verified_first' =
    'recent';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class CreateReviewDto {
  @IsString()
  brandId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @MinLength(50)
  body: string;

  @IsOptional()
  @IsString()
  pros?: string;

  @IsOptional()
  @IsString()
  cons?: string;

  @IsBoolean()
  recommend: boolean;
}

export class UpdateReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(50)
  body?: string;

  @IsOptional()
  @IsString()
  pros?: string;

  @IsOptional()
  @IsString()
  cons?: string;

  @IsOptional()
  @IsBoolean()
  recommend?: boolean;
}

export class ReportReviewDto {
  @IsEnum(ReportReason)
  reason: ReportReason;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AddMediaDto {
  @IsString()
  url: string;

  @IsString()
  type: 'photo' | 'receipt';
}

export class BrandSuggestionDto {
  @IsString()
  name: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(BrandCategory)
  category: BrandCategory;

  @IsOptional()
  @IsString()
  subType?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city: City;

  @IsString()
  area: string;

  @IsOptional()
  @IsUrl()
  website?: string;
}
