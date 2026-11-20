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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IdentifierType, LocationType } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

export class IdentifierInputDto {
  @ApiProperty({ enum: IdentifierType, example: IdentifierType.INSTAGRAM })
  @Transform(upper)
  @IsEnum(IdentifierType)
  type: IdentifierType;

  @ApiProperty({
    example: '@kemis_closet',
    description:
      'Handle, URL, phone, email, CAC number or alternative name. Normalised server-side.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  value: string;
}

export class LocationInputDto {
  @ApiPropertyOptional({ enum: LocationType, default: LocationType.ADDRESS })
  @IsOptional()
  @Transform(upper)
  @IsEnum(LocationType)
  type?: LocationType;

  @ApiPropertyOptional({ example: '12 Admiralty Way' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @ApiPropertyOptional({ example: 'Lekki Phase 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    example: 'lagos',
    description: 'Nigerian state slug or name (see GET /locations)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Operates nationwide (e.g. delivers anywhere in Nigeria)',
  })
  @IsOptional()
  @IsBoolean()
  nationwide?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export const BUSINESS_SORTS = ['relevance', 'most_reviewed', 'rating'] as const;
export type BusinessSort = (typeof BUSINESS_SORTS)[number];

export class SearchBusinessesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'kemi',
    description:
      'Name, alternative name, social handle (with or without @), website, phone or CAC number. Partial matches work.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    example: 'fashion-clothing',
    description: 'Category slug',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ example: 'lagos', description: 'State slug or name' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @ApiPropertyOptional({
    example: 'Lekki',
    description: 'City or area (partial match)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    example: 4,
    description:
      'Minimum average rating. Only businesses with enough reviews for a reliable rating can match.',
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

/** Fields shared by admin create/edit. */
export class BusinessProfileFieldsDto {
  @ApiPropertyOptional({ example: 'Contemporary womenswear made in Lagos.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/demo/image/upload/talkground/logos/abc.png',
    description:
      'From an upload to the "logos" folder (POST /uploads/signature)',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://kemiscloset.ng' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'] })
  @MaxLength(300)
  website?: string;

  @ApiPropertyOptional({ example: 'hello@kemiscloset.ng' })
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
  @ApiProperty({ example: "Kemi's Closet" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'fashion-clothing', description: 'Category slug' })
  @IsString()
  @MaxLength(60)
  category: string;

  @ApiPropertyOptional({ type: [IdentifierInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => IdentifierInputDto)
  identifiers?: IdentifierInputDto[];

  @ApiPropertyOptional({ type: [LocationInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LocationInputDto)
  locations?: LocationInputDto[];

  @ApiPropertyOptional({
    default: true,
    description: 'false keeps the listing in pending_review (not public)',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Required when similarly named businesses exist: confirms this is a different business.',
  })
  @IsOptional()
  @IsBoolean()
  confirmNotDuplicate?: boolean;
}

export class AdminUpdateBusinessDto extends BusinessProfileFieldsDto {
  @ApiPropertyOptional({ example: "Kemi's Closet" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'fashion-clothing' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({
    type: [LocationInputDto],
    description: 'Replaces all locations',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LocationInputDto)
  locations?: LocationInputDto[];
}

/** What a business owner may change (PRD §7.10 "permitted profile information"). */
export class ManageBusinessDto extends BusinessProfileFieldsDto {
  @ApiPropertyOptional({
    type: [LocationInputDto],
    description: 'Replaces all locations',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LocationInputDto)
  locations?: LocationInputDto[];
}

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
