import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewerDto {
  @ApiProperty({ example: 'Ada N.' }) displayName: string;
  @ApiProperty({ nullable: true, example: 'ada_n' }) username: string | null;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty({
    description:
      'PRD §6.4 "Account verified": email verified. NOT proof of purchase.',
  })
  emailVerified: boolean;
}

export class ReviewBusinessRefDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
}

export class ReviewDimensionDto {
  @ApiProperty({ example: 'delivery' }) key: string;
  @ApiProperty({ example: 'Delivery' }) label: string;
  @ApiProperty({ example: 4, minimum: 1, maximum: 5 }) value: number;
}

export class ReviewLabelDto {
  @ApiProperty({
    enum: [
      'account_verified',
      'evidence_attached',
      'evidence_reviewed',
      'under_investigation',
    ],
  })
  key: string;
  @ApiProperty({ example: 'Account verified' }) label: string;
  @ApiProperty({
    example:
      'The reviewer confirmed their email address. This does not prove a purchase.',
  })
  description: string;
}

export class PhotoDto {
  @ApiProperty() id: string;
  @ApiProperty() url: string;
}

export class RepresentativeDto {
  @ApiProperty({ example: 'Kemi A.' }) displayName: string;
}

export class BusinessResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() body: string;
  @ApiProperty({ example: "Response from Kemi's Closet" }) label: string;
  @ApiProperty() businessName: string;
  @ApiProperty({ type: RepresentativeDto }) representative: RepresentativeDto;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true }) editedAt: Date | null;
  @ApiProperty() edited: boolean;
}

export class ResolutionDto {
  @ApiProperty({
    enum: [
      'none',
      'business_responded',
      'resolution_proposed',
      'resolved_by_consumer',
      'reopened',
    ],
  })
  status: string;
  @ApiProperty({ example: 'Business has responded' }) label: string;
}

export class ReviewDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ type: ReviewBusinessRefDto })
  business?: ReviewBusinessRefDto;
  @ApiProperty({ type: ReviewerDto }) reviewer: ReviewerDto;
  @ApiProperty({ example: 4 }) overallRating: number;
  @ApiProperty({ type: [ReviewDimensionDto] }) dimensions: ReviewDimensionDto[];
  @ApiProperty({ example: 'Great fabric, slow delivery' }) title: string;
  @ApiProperty() body: string;
  @ApiProperty({ nullable: true }) recommend: boolean | null;
  @ApiProperty({
    enum: [
      'pending',
      'published',
      'under_investigation',
      'suspended',
      'removed',
    ],
  })
  status: string;
  @ApiProperty({
    description: 'PRD §6.4 "Evidence attached" (not yet looked at by staff)',
  })
  evidenceAttached: boolean;
  @ApiProperty({
    enum: ['not_reviewed', 'accepted', 'rejected'],
    description: 'PRD §6.4 "Evidence reviewed" when accepted',
  })
  evidenceStatus: string;
  @ApiProperty({
    description:
      'PRD §6.4: open report or dispute, or a moderator investigation',
  })
  underInvestigation: boolean;
  @ApiProperty({
    type: [ReviewLabelDto],
    description: 'Display text for the labels that apply, in order',
  })
  labels: ReviewLabelDto[];
  @ApiProperty({ type: [PhotoDto] }) photos: PhotoDto[];
  @ApiProperty({ example: 3 }) helpfulCount: number;
  @ApiProperty({
    nullable: true,
    description: 'Signed-in callers only; null for guests',
  })
  helpfulByMe: boolean | null;
  @ApiProperty({ type: ResolutionDto }) resolution: ResolutionDto;
  @ApiProperty({ type: BusinessResponseDto, nullable: true })
  response: BusinessResponseDto | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true }) publishedAt: Date | null;
  @ApiProperty({ nullable: true, description: 'Show "Edited" with this date' })
  editedAt: Date | null;
  @ApiProperty() edited: boolean;
}

export class ResolutionEventDto {
  @ApiProperty() status: string;
  @ApiProperty() label: string;
  @ApiProperty({ enum: ['consumer', 'business', 'system', 'staff'] })
  by: string;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty() at: Date;
}

export class ReviewDetailDto extends ReviewDto {
  @ApiProperty({ type: [ResolutionEventDto] })
  resolutionHistory: ResolutionEventDto[];
  @ApiProperty() isMine: boolean;
}

export class ReviewCreatedDto extends ReviewDto {
  @ApiProperty({
    nullable: true,
    description:
      'Set when the review is held for a moderator check (status pending)',
  })
  moderation: string | null;
}

export class MyReviewDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: ReviewBusinessRefDto }) business: ReviewBusinessRefDto;
  @ApiProperty() overallRating: number;
  @ApiProperty() title: string;
  @ApiProperty() excerpt: string;
  @ApiProperty({ example: 'published' }) status: string;
  @ApiProperty() deleted: boolean;
  @ApiProperty({ type: ResolutionDto }) resolution: ResolutionDto;
  @ApiProperty() hasBusinessResponse: boolean;
  @ApiProperty() helpfulCount: number;
  @ApiProperty() evidenceAttached: boolean;
  @ApiProperty() evidenceStatus: string;
  @ApiProperty() underInvestigation: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true }) editedAt: Date | null;
}

export class RevisionDto {
  @ApiProperty() id: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      '{ overallRating, title, body, recommend, dimensions, editedBy }',
  })
  snapshot: Record<string, unknown>;
  @ApiProperty() createdAt: Date;
}

export class EvidenceCreatedDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['photo', 'receipt'] }) type: string;
  @ApiProperty() isPrivate: boolean;
  @ApiPropertyOptional({ description: 'Only for public photos' }) url?: string;
  @ApiProperty() createdAt: Date;
}

export class HelpfulStateDto {
  @ApiProperty({
    description: 'Whether the caller now marks the review helpful',
  })
  helpful: boolean;
  @ApiProperty() helpfulCount: number;
}

export class ReportReceiptDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'open' }) status: string;
  @ApiProperty() message: string;
}
