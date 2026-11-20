import { ApiProperty } from '@nestjs/swagger';

export class CategoryDimensionOutDto {
  @ApiProperty({ example: 'delivery' }) key: string;
  @ApiProperty({ example: 'Delivery' }) label: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({
    description: 'Must be rated when true; optional dimensions may be skipped',
  })
  required: boolean;
  @ApiProperty({ example: 3 }) order: number;
}

export class CategoryOutDto {
  @ApiProperty({ example: 'food-and-restaurants' }) slug: string;
  @ApiProperty({ example: 'Food and restaurants' }) name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true, example: null }) parentSlug: string | null;
  @ApiProperty({ type: [CategoryDimensionOutDto] })
  ratingDimensions: CategoryDimensionOutDto[];
  @ApiProperty({ example: 12, description: 'Published businesses' })
  businessCount: number;
  @ApiProperty({ example: '/c/food-and-restaurants' }) path: string;
}

export class CityOutDto {
  @ApiProperty({ example: 'lagos' }) slug: string;
  @ApiProperty({ example: 'Lagos' }) name: string;
  @ApiProperty({ example: 'Lagos' }) state: string;
  @ApiProperty({ example: 'NG' }) countryCode: string;
  @ApiProperty({ example: 30, description: 'Published businesses' })
  businessCount: number;
}

export class MethodologyDto {
  @ApiProperty({ example: '2.0' }) version: string;
  @ApiProperty({ example: '2026-11-21' }) effectiveFrom: string;
  @ApiProperty({ example: 3 }) minimumReviews: number;
  @ApiProperty({ type: [String] }) rules: string[];
}

export class PublicConfigDto {
  @ApiProperty({ example: 3 }) minReviewsForRating: number;
  @ApiProperty({ example: 50 }) reviewBodyMinLength: number;
  @ApiProperty({ example: 3 }) reviewTitleMinLength: number;
  @ApiProperty({ example: 120 }) reviewTitleMaxLength: number;
  @ApiProperty({ example: 3 }) reviewDailyLimit: number;
  @ApiProperty({ example: false }) requirePhoneVerifiedForReviews: boolean;
  @ApiProperty({ example: 80 }) indexableMinDescriptionChars: number;
  @ApiProperty({ example: 0 }) indexableMinReviews: number;
  @ApiProperty({ example: 5 }) indexableMinListings: number;
  @ApiProperty({
    example: 15,
    description: 'Revalidate cached public pages at least this often',
  })
  publicCacheMaxMinutes: number;
  @ApiProperty({ example: 900 }) accessTokenSeconds: number;
}
