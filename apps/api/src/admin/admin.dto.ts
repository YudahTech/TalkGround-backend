import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PolicyReason } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

// ─────────────────────────────────────────────────────────────── users & staff

export class UserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Email, username or display name contains',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ['all', 'suspended', 'staff'] })
  @IsOptional()
  @IsIn(['all', 'suspended', 'staff'])
  filter?: 'all' | 'suspended' | 'staff';
}

export class SuspendUserDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  suspended: boolean;

  @ApiProperty({ example: 'Posted fabricated reviews from multiple accounts' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class SetStaffRoleDto {
  @ApiProperty({
    nullable: true,
    example: 'moderator',
    description:
      'AdminRole key (GET /admin/roles), or null to remove staff access',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  roleKey: string | null;
}

// ────────────────────────────────────────────────────────────────── businesses

export class AdminBusinessQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name contains' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    enum: ['pending_review', 'published', 'suspended', 'merged', 'archived'],
  })
  @IsOptional()
  @IsIn(['pending_review', 'published', 'suspended', 'merged', 'archived'])
  status?: string;

  @ApiPropertyOptional({
    enum: ['unclaimed', 'claim_pending', 'claimed', 'verified'],
  })
  @IsOptional()
  @IsIn(['unclaimed', 'claim_pending', 'claimed', 'verified'])
  ownership?: string;

  @ApiPropertyOptional({ description: 'Category slug' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;
}

export class BusinessStatusDto {
  @ApiProperty({
    enum: ['published', 'suspended', 'archived', 'pending_review'],
  })
  @IsIn(['published', 'suspended', 'archived', 'pending_review'])
  status: 'published' | 'suspended' | 'archived' | 'pending_review';

  @ApiProperty({ example: 'Impersonating another vendor' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class InvestigationDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  underInvestigation: boolean;

  @ApiPropertyOptional({
    example: 'We are reviewing an unusual pattern of reviews on this profile.',
    description: 'Shown publicly on the profile',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  publicNote?: string;

  @ApiProperty({
    example: 'Spike of 5-star reviews from new accounts on the same IP',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class MergeBusinessDto {
  @ApiProperty({ description: 'The listing to keep (canonical)' })
  @IsUUID()
  targetId: string;

  @ApiProperty({
    example: 'Same Instagram vendor listed twice under different spellings',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

// ───────────────────────────────────────────────────────────────── moderation

export const REVIEW_QUEUES = [
  'pending_moderation',
  'under_investigation',
  'reported',
  'evidence',
  'removed',
] as const;

export class ReviewQueueQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_QUEUES, default: 'pending_moderation' })
  @IsOptional()
  @IsIn(REVIEW_QUEUES)
  queue?: (typeof REVIEW_QUEUES)[number];
}

export class ModerateReviewDto {
  @ApiProperty({
    enum: [
      'publish',
      'remove',
      'restore',
      'investigate',
      'clear_investigation',
    ],
    description:
      'publish: release a held review. remove: take down (breaks a rule). restore: undo a removal. ' +
      'investigate: keep visible with the "Under investigation" label. clear_investigation: remove that label.',
  })
  @IsIn(['publish', 'remove', 'restore', 'investigate', 'clear_investigation'])
  action:
    | 'publish'
    | 'remove'
    | 'restore'
    | 'investigate'
    | 'clear_investigation';

  @ApiProperty({
    enum: PolicyReason,
    example: PolicyReason.NO_VIOLATION,
    description: 'Policy ground (PRD §8.2)',
  })
  @Transform(upper)
  @IsEnum(PolicyReason)
  reason: PolicyReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class EvidenceDecisionDto {
  @ApiProperty({
    enum: ['accepted', 'rejected'],
    description:
      'accepted shows "Evidence reviewed" on the review. rejected hides the file.',
  })
  @IsIn(['accepted', 'rejected'])
  decision: 'accepted' | 'rejected';

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RemoveResponseDto {
  @ApiProperty({ enum: PolicyReason, example: PolicyReason.HARASSMENT })
  @Transform(upper)
  @IsEnum(PolicyReason)
  reason: PolicyReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['open', 'actioned', 'dismissed'],
    default: 'open',
  })
  @IsOptional()
  @IsIn(['open', 'actioned', 'dismissed'])
  status?: string;
}

export class DecideReportDto {
  @ApiProperty({
    enum: ['dismiss', 'remove_review', 'investigate_review'],
    description:
      'dismiss closes the report with no change. The other two act on the review and close every open report on it.',
  })
  @IsIn(['dismiss', 'remove_review', 'investigate_review'])
  decision: 'dismiss' | 'remove_review' | 'investigate_review';

  @ApiProperty({ enum: PolicyReason, example: PolicyReason.NO_VIOLATION })
  @Transform(upper)
  @IsEnum(PolicyReason)
  reason: PolicyReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class DisputeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['open', 'upheld', 'rejected', 'withdrawn'],
    default: 'open',
  })
  @IsOptional()
  @IsIn(['open', 'upheld', 'rejected', 'withdrawn'])
  status?: string;
}

export class DecideDisputeDto {
  @ApiProperty({
    enum: ['uphold', 'reject'],
    description:
      'uphold: the review breaks a rule (choose reviewAction). reject: the review stays as is.',
  })
  @IsIn(['uphold', 'reject'])
  decision: 'uphold' | 'reject';

  @ApiPropertyOptional({
    enum: ['remove', 'investigate'],
    description: 'Required when upholding',
  })
  @IsOptional()
  @IsIn(['remove', 'investigate'])
  reviewAction?: 'remove' | 'investigate';

  @ApiProperty({ enum: PolicyReason, example: PolicyReason.NO_VIOLATION })
  @Transform(upper)
  @IsEnum(PolicyReason)
  reason: PolicyReason;

  @ApiProperty({
    example:
      'The order confirmation the reviewer provided matches the business records.',
    description: 'Sent to both parties',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note: string;
}

// ─────────────────────────────────────────────────────────────────── taxonomy

export class CategoryDimensionInputDto {
  @ApiProperty({ example: 'communication' })
  @IsString()
  @MaxLength(60)
  key: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  required: boolean;
}

export class UpsertCategoryDto {
  @ApiProperty({ example: 'Hotels & Accommodation' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    example: 'Hotels, guest houses and short-let apartments.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [CategoryDimensionInputDto],
    description: 'Replaces the category dimensions, in order',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CategoryDimensionInputDto)
  dimensions?: CategoryDimensionInputDto[];
}

export class CreateCategoryDto extends UpsertCategoryDto {
  @ApiProperty({ example: 'hotels-accommodation' })
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  @MaxLength(60)
  slug: string;
}

export class UpsertDimensionDto {
  @ApiProperty({ example: 'Cleanliness' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ example: 'How clean the place or product was' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateDimensionDto extends UpsertDimensionDto {
  @ApiProperty({ example: 'cleanliness' })
  @Matches(/^[a-z0-9]+(_[a-z0-9]+)*$/)
  @MaxLength(60)
  key: string;
}

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'business' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ example: 'claim.', description: 'Action prefix' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;
}
