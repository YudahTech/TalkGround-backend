import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewDto } from '../reviews/reviews.responses';

export class CategoryRefDto {
  @ApiProperty({ example: 'food-and-restaurants' }) slug: string;
  @ApiProperty({ example: 'Food and restaurants' }) name: string;
}

export class CityRefDto {
  @ApiProperty({ example: 'lagos' }) slug: string;
  @ApiProperty({ example: 'Lagos' }) name: string;
  @ApiProperty({ example: 'Lagos' }) state: string;
}

export class BusinessLocationDto {
  @ApiProperty({ type: CityRefDto, nullable: true }) city: CityRefDto | null;
  @ApiProperty({ example: 'Yaba', nullable: true }) area: string | null;
  @ApiProperty({ example: false, description: 'Sells online / delivers only' })
  onlineOnly: boolean;
  @ApiProperty({
    example: 'Yaba, Lagos',
    description: 'Ready-to-display location text',
  })
  label: string;
}

export class RatingCompactDto {
  @ApiProperty({ example: 6 }) reviewCount: number;
  @ApiProperty({
    example: 4.2,
    nullable: true,
    description: 'null below the minimum review count',
  })
  average: number | null;
  @ApiProperty({ example: true }) sufficientData: boolean;
  @ApiProperty({
    example: null,
    nullable: true,
    description: '"Not enough reviews yet" when insufficient',
  })
  message: string | null;
}

export class DistributionEntryDto {
  @ApiProperty({ example: 5 }) stars: number;
  @ApiProperty({ example: 3 }) count: number;
  @ApiProperty({ example: 50 }) percent: number;
}

export class DimensionAverageDto {
  @ApiProperty({ example: 'delivery' }) key: string;
  @ApiProperty({ example: 'Delivery' }) label: string;
  @ApiProperty({ example: 4 }) reviewCount: number;
  @ApiProperty({ example: 3.8, nullable: true }) average: number | null;
  @ApiProperty({ example: true }) sufficientData: boolean;
}

export class RatingSummaryDto extends RatingCompactDto {
  @ApiProperty({ example: 3 }) minimumReviews: number;
  @ApiProperty({ type: [DistributionEntryDto] })
  distribution: DistributionEntryDto[];
  @ApiProperty({ type: [DimensionAverageDto] })
  dimensions: DimensionAverageDto[];
}

export class OwnershipDto {
  @ApiProperty({
    enum: ['unclaimed', 'claimed'],
    description: 'A pending claim is shown as unclaimed',
  })
  status: 'unclaimed' | 'claimed';
  @ApiProperty({
    example: false,
    description: 'PRD §6.4 business.ownershipVerified',
  })
  ownershipVerified: boolean;
  @ApiProperty({ example: 'Ownership verified' }) label: string;
  @ApiProperty({
    example:
      'TalkGround confirmed the people managing this profile control the business. This is not an endorsement.',
  })
  description: string;
}

export class BusinessCardDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'mama-put-kitchen' }) slug: string;
  @ApiProperty({ example: 'Mama Put Kitchen' }) name: string;
  @ApiProperty({ nullable: true }) logoUrl: string | null;
  @ApiProperty({ type: CategoryRefDto }) category: CategoryRefDto;
  @ApiProperty({ type: BusinessLocationDto }) location: BusinessLocationDto;
  @ApiProperty({ type: RatingCompactDto }) rating: RatingCompactDto;
  @ApiProperty({ type: OwnershipDto }) ownership: OwnershipDto;
  @ApiProperty({ example: '/b/mama-put-kitchen' }) path: string;
}

export class IdentifierPublicDto {
  @ApiProperty({ example: 'instagram' }) type: string;
  @ApiProperty({ example: '@mamaput_lagos' }) value: string;
  @ApiProperty({ example: 'mamaput_lagos' }) normalizedValue: string;
  @ApiProperty({ example: false }) verified: boolean;
}

export class PublicContactDto {
  @ApiProperty({ nullable: true }) website: string | null;
  @ApiProperty({ nullable: true }) email: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
}

export class OpenGraphDto {
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() url: string;
  @ApiProperty({ example: 'website' }) type: string;
  @ApiProperty({ nullable: true }) image: string | null;
}

export class SeoDto {
  @ApiProperty({
    description:
      'Meets the PRD §7.13 indexable rule and is not force-noindexed',
  })
  indexable: boolean;
  @ApiProperty({
    example: 'index,follow',
    enum: ['index,follow', 'noindex,follow'],
  })
  robots: string;
  @ApiProperty({ example: '/b/mama-put-kitchen' }) canonicalPath: string;
  @ApiProperty({ example: 'https://talkground.ng/b/mama-put-kitchen' })
  canonicalUrl: string;
  @ApiProperty({ example: 'Mama Put Kitchen Reviews | TalkGround' })
  title: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: OpenGraphDto }) openGraph: OpenGraphDto;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'JSON-LD to embed as-is. aggregateRating only when a rating is displayed.',
  })
  jsonLd: Record<string, unknown>;
}

export class BusinessProfileDto {
  @ApiProperty({ enum: ['profile'] }) kind: 'profile';
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) logoUrl: string | null;
  @ApiProperty({ type: CategoryRefDto }) category: CategoryRefDto;
  @ApiProperty({ type: BusinessLocationDto }) location: BusinessLocationDto;
  @ApiProperty({ type: [IdentifierPublicDto] })
  identifiers: IdentifierPublicDto[];
  @ApiProperty({ type: PublicContactDto }) publicContact: PublicContactDto;
  @ApiProperty({ type: RatingSummaryDto }) rating: RatingSummaryDto;
  @ApiProperty({ type: OwnershipDto }) ownership: OwnershipDto;
  @ApiProperty({ example: 'published' }) status: string;
  @ApiProperty({ example: 2 }) responseCount: number;
  @ApiProperty({
    type: () => [ReviewDto],
    description: 'Most recent 10 visible reviews (SSR-ready)',
  })
  recentReviews: ReviewDto[];
  @ApiProperty({
    example:
      'A public listing does not mean TalkGround endorses or has verified this business.',
  })
  disclaimer: string;
  @ApiProperty({ nullable: true }) publishedAt: Date | null;
  @ApiProperty({ type: SeoDto }) seo: SeoDto;
}

export class BusinessRedirectDto {
  @ApiProperty({ enum: ['redirect'] }) kind: 'redirect';
  @ApiProperty({ enum: ['slug_changed', 'merged'] }) reason:
    | 'slug_changed'
    | 'merged';
  @ApiProperty({ example: 'mama-put-kitchen-yaba' }) slug: string;
  @ApiProperty({ example: '/b/mama-put-kitchen-yaba' }) location: string;
  @ApiProperty({ example: 301 }) statusCode: 301;
}

export class BusinessNoticeDto {
  @ApiProperty({ enum: ['suspended'] }) kind: 'suspended';
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: 'This business profile is temporarily unavailable.' })
  notice: string;
  @ApiProperty({ example: 'noindex,follow' }) robots: string;
}

export class SearchBusinessesResultDto extends BusinessCardDto {}

export class ManagedIdentifierDto extends IdentifierPublicDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: true }) editableByOwner: boolean;
}

export class DuplicateCandidateDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: 'published' }) status: string;
  @ApiProperty({ example: ['same instagram (mamaput_lagos)'], type: [String] })
  reasons: string[];
}

export class CategoryPageDto {
  @ApiProperty({ type: CategoryRefDto }) category: CategoryRefDto;
  @ApiProperty({ type: CityRefDto, nullable: true }) city: CityRefDto | null;
  @ApiProperty({ example: 12 }) total: number;
  @ApiProperty({ type: [BusinessCardDto] }) businesses: BusinessCardDto[];
  @ApiPropertyOptional({ type: SeoDto }) seo: SeoDto;
}
