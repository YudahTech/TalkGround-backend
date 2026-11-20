import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BusinessLocationDto,
  CategoryRefDto,
  DuplicateCandidateDto,
  ManagedIdentifierDto,
  RatingSummaryDto,
} from '../businesses/businesses.responses';

export class AdminTotalsDto {
  @ApiProperty() publishedBusinesses: number;
  @ApiProperty() claimedBusinesses: number;
  @ApiProperty() publishedReviews: number;
  @ApiProperty() users: number;
}

export class AdminQueuesDto {
  @ApiProperty() pendingReviews: number;
  @ApiProperty() underInvestigation: number;
  @ApiProperty() openReports: number;
  @ApiProperty() activeDisputes: number;
  @ApiProperty() pendingClaims: number;
  @ApiProperty() pendingSubmissions: number;
  @ApiProperty() evidenceToReview: number;
  @ApiProperty() failedEmails: number;
}

export class AdminDashboardDto {
  @ApiProperty({ type: AdminTotalsDto }) totals: AdminTotalsDto;
  @ApiProperty({ type: AdminQueuesDto }) queues: AdminQueuesDto;
}

export class StaffRoleRefDto {
  @ApiProperty({ example: 'moderator' }) key: string;
  @ApiProperty({ example: 'Moderator' }) name: string;
}

export class AdminUserDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() username: string;
  @ApiProperty() displayName: string;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty() phoneVerified: boolean;
  @ApiProperty() suspended: boolean;
  @ApiProperty({ nullable: true }) suspendedReason: string | null;
  @ApiProperty({ nullable: true }) deletedAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: StaffRoleRefDto, nullable: true })
  adminRole: StaffRoleRefDto | null;
}

export class AdminUserDetailDto extends AdminUserDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  memberships: Record<string, unknown>[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  recentReviews: Record<string, unknown>[];
  @ApiProperty({ type: 'object', additionalProperties: true }) counts: Record<
    string,
    number
  >;
}

export class RoleDto {
  @ApiProperty() key: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ type: [String] }) permissions: string[];
  @ApiProperty() members: number;
}

export class RolesDto {
  @ApiProperty({ type: [RoleDto] }) roles: RoleDto[];
  @ApiProperty({ type: [String] }) allPermissions: string[];
}

export class AdminBusinessListItemDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: CategoryRefDto }) category: CategoryRefDto;
  @ApiProperty({ type: BusinessLocationDto }) location: BusinessLocationDto;
  @ApiProperty() status: string;
  @ApiProperty() ownershipStatus: string;
  @ApiProperty() ownershipVerified: boolean;
  @ApiProperty() createdBySource: string;
  @ApiProperty() noindexOverride: boolean;
  @ApiProperty() indexable: boolean;
  @ApiProperty() reviewCount: number;
  @ApiProperty() pendingClaims: number;
  @ApiProperty() createdAt: Date;
}

export class AdminBusinessDetailDto extends AdminBusinessListItemDto {
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) logoUrl: string | null;
  @ApiProperty({ nullable: true }) website: string | null;
  @ApiProperty({ nullable: true }) publicEmail: string | null;
  @ApiProperty({ nullable: true }) publicPhone: string | null;
  @ApiProperty({ type: [ManagedIdentifierDto] })
  identifiers: ManagedIdentifierDto[];
  @ApiProperty({ type: [String] }) previousSlugs: string[];
  @ApiProperty({ type: RatingSummaryDto }) rating: RatingSummaryDto;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) members: Record<
    string,
    unknown
  >[];
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  mergedInto: Record<string, unknown> | null;
  @ApiProperty({ type: [DuplicateCandidateDto] })
  duplicateCandidates: DuplicateCandidateDto[];
  @ApiProperty({
    type: [String],
    description: 'Allowed next statuses (PRD §7.4)',
  })
  allowedTransitions: string[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) auditTrail: Record<
    string,
    unknown
  >[];
}

export class DuplicatePairSideDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
}

export class DuplicatePairDto {
  @ApiProperty({ type: DuplicatePairSideDto }) a: DuplicatePairSideDto;
  @ApiProperty({ type: DuplicatePairSideDto }) b: DuplicatePairSideDto;
  @ApiProperty({ type: [String] }) signals: string[];
  @ApiProperty({ nullable: true }) nameSimilarity: number | null;
}

export class MergeResultDto {
  @ApiProperty({ type: DuplicatePairSideDto }) source: DuplicatePairSideDto;
  @ApiProperty({ type: DuplicatePairSideDto }) target: DuplicatePairSideDto;
  @ApiProperty() movedReviews: number;
}

export class QueueItemDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() overallRating: number;
  @ApiProperty() title: string;
  @ApiProperty() excerpt: string;
  @ApiProperty({ type: DuplicatePairSideDto }) business: DuplicatePairSideDto;
  @ApiProperty({ type: 'object', additionalProperties: true }) author: Record<
    string,
    unknown
  >;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) flags: Record<
    string,
    unknown
  >[];
  @ApiProperty() underInvestigation: boolean;
  @ApiProperty() evidenceAttached: boolean;
  @ApiProperty() evidenceStatus: string;
  @ApiProperty() openReports: number;
  @ApiProperty() activeDisputes: number;
  @ApiProperty() createdAt: Date;
}

export class AdminEvidenceDto {
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty() isPrivate: boolean;
  @ApiProperty({
    nullable: true,
    description:
      'Public URL, or 10-minute signed URL for receipts (evidence.review only)',
  })
  viewUrl: string | null;
  @ApiProperty() restricted: boolean;
  @ApiProperty() createdAt: Date;
}

export class AdminReviewDetailDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Full review incl. author, business, dimensions',
  })
  review: Record<string, unknown>;
  @ApiProperty({ type: [AdminEvidenceDto] }) evidence: AdminEvidenceDto[];
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Full edit history (snapshots)',
  })
  revisions: Record<string, unknown>[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) flags: Record<
    string,
    unknown
  >[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) reports: Record<
    string,
    unknown
  >[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) disputes: Record<
    string,
    unknown
  >[];
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  response: Record<string, unknown> | null;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  moderationHistory: Record<string, unknown>[];
  @ApiProperty() authorOtherReviews: number;
}

export class ModerationResultDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional() reportsClosed?: number;
}

export class AdminReportDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['review', 'response'] }) target: string;
  @ApiProperty() reviewId: string;
  @ApiProperty({ nullable: true }) responseId: string | null;
  @ApiProperty() reasonCode: string;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty() status: string;
  @ApiProperty() reporterType: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) reporter: Record<
    string,
    unknown
  >;
  @ApiProperty({ type: 'object', additionalProperties: true }) review: Record<
    string,
    unknown
  >;
  @ApiProperty() createdAt: Date;
}

export class AdminDisputeDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() reason: string;
  @ApiProperty({ nullable: true }) decision: string | null;
  @ApiProperty({ type: DuplicatePairSideDto }) business: DuplicatePairSideDto;
  @ApiProperty({ type: 'object', additionalProperties: true }) review: Record<
    string,
    unknown
  >;
  @ApiProperty({ type: 'object', additionalProperties: true }) openedBy: Record<
    string,
    unknown
  >;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true }) decidedAt: Date | null;
}

export class AdminDisputeDetailDto extends AdminDisputeDto {
  @ApiProperty({ type: AdminReviewDetailDto })
  reviewDetail: AdminReviewDetailDto;
}

export class CategoryAdminDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() active: boolean;
  @ApiProperty({ nullable: true }) parentSlug: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() businessCount: number;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) dimensions: Record<
    string,
    unknown
  >[];
}

export class DimensionAdminDto {
  @ApiProperty() id: string;
  @ApiProperty() key: string;
  @ApiProperty() label: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() active: boolean;
}

export class CityAdminDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty() state: string;
  @ApiProperty() countryCode: string;
  @ApiProperty() active: boolean;
  @ApiProperty() businessCount: number;
}

export class TaxonomyDto {
  @ApiProperty({ type: [CategoryAdminDto] }) categories: CategoryAdminDto[];
  @ApiProperty({ type: [DimensionAdminDto] }) dimensions: DimensionAdminDto[];
  @ApiProperty({ type: [CityAdminDto] }) cities: CityAdminDto[];
}

export class AuditLogDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) actorId: string | null;
  @ApiProperty({ nullable: true }) actorRole: string | null;
  @ApiProperty() action: string;
  @ApiProperty() targetType: string;
  @ApiProperty() targetId: string;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  before: unknown;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  after: unknown;
  @ApiProperty({ nullable: true }) reason: string | null;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  metadata: unknown;
  @ApiProperty() createdAt: Date;
}

export class EmailLogDto {
  @ApiProperty() id: string;
  @ApiProperty() to: string;
  @ApiProperty() kind: string;
  @ApiProperty() subject: string;
  @ApiProperty() status: string;
  @ApiProperty() attempts: number;
  @ApiProperty({ nullable: true }) lastError: string | null;
  @ApiProperty({ nullable: true }) sentAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class EmailRetryDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() delivered: boolean;
  @ApiProperty() attempts: number;
}
