import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IdentifierType } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';
import { toUpperCase } from '../common/transforms';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class IdentifierInputDto {
  @ApiProperty({ enum: IdentifierType, example: IdentifierType.INSTAGRAM })
  @Transform(toUpperCase)
  @IsEnum(IdentifierType)
  type: IdentifierType;

  @ApiProperty({
    example: '@mamaput_lagos',
    description:
      'Handle or profile URL, website, phone, email, alternative name or other public identifier. Normalised server-side.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  value: string;
}

/** Location fields shared by create/update/submission: a city (GET /cities) plus area, or online only. */
export class LocationFieldsDto {
  @ApiPropertyOptional({
    example: 'lagos',
    description: 'City slug from GET /cities. Omit when onlineOnly.',
  })
  @IsOptional()
  @Matches(SLUG)
  @MaxLength(60)
  city?: string;

  @ApiPropertyOptional({
    example: 'Yaba',
    description: 'Neighbourhood or area (free text)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  area?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'No physical location: sells online or delivers only',
  })
  @IsOptional()
  @IsBoolean()
  onlineOnly?: boolean;
}

export const BUSINESS_SORTS = ['relevance', 'most_reviewed', 'rating'] as const;
export type BusinessSort = (typeof BUSINESS_SORTS)[number];

export class SearchBusinessesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '@mamaput_lagos',
    description:
      'Name, alternative name, social handle (with or without @), website domain, phone (exact), category, city or area. Partial words work.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    example: 'food-and-restaurants',
    description: 'Category slug',
  })
  @IsOptional()
  @Matches(SLUG)
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ example: 'lagos', description: 'City slug' })
  @IsOptional()
  @Matches(SLUG)
  @MaxLength(60)
  city?: string;

  @ApiPropertyOptional({
    example: 4,
    description:
      'Minimum average rating. Only businesses with enough reviews for a displayed rating can match.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ enum: BUSINESS_SORTS, default: 'relevance' })
  @IsOptional()
  @IsIn(BUSINESS_SORTS)
  sort?: BusinessSort;
}

export class BusinessProfileFieldsDto extends LocationFieldsDto {
  @ApiPropertyOptional({
    example:
      'Home-style Nigerian food in Yaba: amala, ewedu, ofada rice and pepper soup, with delivery across the mainland.',
    description:
      'Factual, specific description. At least 80 characters for the page to be indexable (PRD §7.13).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description:
      'From an upload to the "logos" folder (POST /uploads/signature)',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://mamaput.ng' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'] })
  @MaxLength(300)
  website?: string;

  @ApiPropertyOptional({ example: 'hello@mamaput.ng' })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  publicEmail?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  publicPhone?: string;
}

export class CreateBusinessDto extends BusinessProfileFieldsDto {
  @ApiProperty({ example: 'Mama Put Kitchen' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({
    example: 'food-and-restaurants',
    description: 'Category slug',
  })
  @Matches(SLUG)
  @MaxLength(60)
  category: string;

  @ApiPropertyOptional({ type: [IdentifierInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => IdentifierInputDto)
  identifiers?: IdentifierInputDto[];

  @ApiPropertyOptional({
    default: true,
    description: 'false creates the listing in pending_review (not public)',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Required when possible duplicates exist: confirms this is a different business.',
  })
  @IsOptional()
  @IsBoolean()
  confirmNotDuplicate?: boolean;
}

export class AdminUpdateBusinessDto extends BusinessProfileFieldsDto {
  @ApiPropertyOptional({
    description: 'Renaming regenerates the slug; the old one redirects (301).',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'food-and-restaurants' })
  @IsOptional()
  @Matches(SLUG)
  @MaxLength(60)
  category?: string;
}

/** What a business member may change (PRD §7.10 "permitted profile fields"). */
export class ManageBusinessDto extends BusinessProfileFieldsDto {}

export class ReviewListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['recent', 'helpful', 'rating_high', 'rating_low'],
    default: 'recent',
  })
  @IsOptional()
  @IsIn(['recent', 'helpful', 'rating_high', 'rating_low'])
  sort?: 'recent' | 'helpful' | 'rating_high' | 'rating_low';

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 5,
    description: 'Only reviews with this star rating',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  stars?: number;
}

export class CategoryPageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'lagos',
    description: 'City slug for /c/{category}/{city}',
  })
  @IsOptional()
  @Matches(SLUG)
  @MaxLength(60)
  city?: string;
}
