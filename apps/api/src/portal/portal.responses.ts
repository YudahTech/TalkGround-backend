import { ApiProperty } from '@nestjs/swagger';
import {
  BusinessLocationDto,
  CategoryRefDto,
  DimensionAverageDto,
  DistributionEntryDto,
  ManagedIdentifierDto,
  OwnershipDto,
  RatingCompactDto,
} from '../businesses/businesses.responses';
import { ReviewDto } from '../reviews/reviews.responses';

export class MyBusinessDto {
  @ApiProperty({ example: 'owner' }) role: string;
  @ApiProperty() since: Date;
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) logoUrl: string | null;
  @ApiProperty({ type: CategoryRefDto }) category: CategoryRefDto;
  @ApiProperty({ example: 'published' }) status: string;
  @ApiProperty({ type: OwnershipDto }) ownership: OwnershipDto;
  @ApiProperty({ type: RatingCompactDto }) rating: RatingCompactDto;
}

export class LockedFieldsDto {
  @ApiProperty({ type: [String], example: ['name', 'category'] })
  fields: string[];
  @ApiProperty() reason: string;
}

export class ManagementViewDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) logoUrl: string | null;
  @ApiProperty({ nullable: true }) website: string | null;
  @ApiProperty({ nullable: true }) publicEmail: string | null;
  @ApiProperty({ nullable: true }) publicPhone: string | null;
  @ApiProperty({ type: CategoryRefDto }) category: CategoryRefDto;
  @ApiProperty({ type: BusinessLocationDto }) location: BusinessLocationDto;
  @ApiProperty() status: string;
  @ApiProperty({ type: OwnershipDto }) ownership: OwnershipDto;
  @ApiProperty({ type: [ManagedIdentifierDto] })
  identifiers: ManagedIdentifierDto[];
  @ApiProperty({
    description:
      'Whether search engines may index the page now (same rule for every business)',
  })
  indexable: boolean;
  @ApiProperty({
    type: [String],
    description: 'What still blocks indexing, in plain words',
  })
  indexingChecklist: string[];
  @ApiProperty({ type: [String] }) editableFields: string[];
  @ApiProperty({ type: LockedFieldsDto }) lockedFields: LockedFieldsDto;
}

export class BadgeDto {
  @ApiProperty({ example: 'See our reviews on TalkGround' }) text: string;
  @ApiProperty() url: string;
  @ApiProperty({ description: 'HTML snippet for a website' }) html: string;
}

export class ShareLinksDto {
  @ApiProperty() profileUrl: string;
  @ApiProperty() reviewUrl: string;
  @ApiProperty() suggestedMessage: string;
  @ApiProperty() whatsappShareUrl: string;
  @ApiProperty({ type: BadgeDto }) badge: BadgeDto;
  @ApiProperty() policy: string;
}

export class DashboardRatingDto extends RatingCompactDto {
  @ApiProperty() minimumReviews: number;
  @ApiProperty({ type: [DistributionEntryDto] })
  distribution: DistributionEntryDto[];
  @ApiProperty({ type: [DimensionAverageDto] })
  dimensions: DimensionAverageDto[];
}

export class ResponseActivityDto {
  @ApiProperty() responded: number;
  @ApiProperty() unanswered: number;
  @ApiProperty({
    nullable: true,
    example: 75,
    description: 'Percent of visible reviews with a response',
  })
  responseRate: number | null;
  @ApiProperty({
    nullable: true,
    example: 18.5,
    description: 'Average hours from publication to response',
  })
  averageResponseHours: number | null;
}

export class UnresolvedComplaintsDto {
  @ApiProperty() count: number;
  @ApiProperty() definition: string;
  @ApiProperty({ type: () => [ReviewDto] }) recent: ReviewDto[];
}

export class TrendPointDto {
  @ApiProperty({ example: '2026-11' }) month: string;
  @ApiProperty() reviews: number;
  @ApiProperty({ nullable: true }) averageRating: number | null;
}

export class IssuesCountDto {
  @ApiProperty() openReports: number;
  @ApiProperty() openDisputes: number;
}

export class DashboardDto {
  @ApiProperty({ type: 'object', additionalProperties: true }) business: Record<
    string,
    unknown
  >;
  @ApiProperty({ type: DashboardRatingDto }) rating: DashboardRatingDto;
  @ApiProperty() publishedReviewCount: number;
  @ApiProperty({ type: ResponseActivityDto })
  responseActivity: ResponseActivityDto;
  @ApiProperty({ type: UnresolvedComplaintsDto })
  unresolvedComplaints: UnresolvedComplaintsDto;
  @ApiProperty({ type: [TrendPointDto], description: 'Last 6 months' })
  trend: TrendPointDto[];
  @ApiProperty({ type: IssuesCountDto }) issues: IssuesCountDto;
  @ApiProperty({ type: () => [ReviewDto] }) recentReviews: ReviewDto[];
  @ApiProperty({ type: ShareLinksDto }) shareLinks: ShareLinksDto;
}

export class PortalReviewDto extends ReviewDto {
  @ApiProperty() canRespond: boolean;
  @ApiProperty() canEditResponse: boolean;
  @ApiProperty() canDispute: boolean;
  @ApiProperty({
    nullable: true,
    enum: ['open', 'under_review', 'upheld', 'review_actioned', 'closed'],
  })
  disputeStatus: string | null;
}

export class OwnResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() body: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true }) editedAt: Date | null;
}

export class DisputeCreatedDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'open' }) status: string;
  @ApiProperty() message: string;
}

export class IssueReviewRefDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() overallRating: number;
  @ApiProperty() status: string;
}

export class IssueDisputeDto {
  @ApiProperty() id: string;
  @ApiProperty() reason: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) decision: string | null;
  @ApiProperty({ nullable: true }) decidedAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: IssueReviewRefDto }) review: IssueReviewRefDto;
}

export class IssueReportDto {
  @ApiProperty() id: string;
  @ApiProperty() reasonCode: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) resolutionNote: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: IssueReviewRefDto }) review: IssueReviewRefDto;
}

export class IssuesDto {
  @ApiProperty({ type: [IssueDisputeDto] }) disputes: IssueDisputeDto[];
  @ApiProperty({ type: [IssueReportDto] }) reports: IssueReportDto[];
}

export class IdentifierAddedDto {
  @ApiProperty({ type: ManagedIdentifierDto }) identifier: ManagedIdentifierDto;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Other listings with the same identifier (duplicate signal)',
  })
  alsoUsedBy: Record<string, unknown>[];
}
