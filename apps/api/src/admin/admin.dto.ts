import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
import { toUpperCase } from '../common/transforms';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

  @ApiProperty({ example: 'Posted fabricated reviews from several accounts' })
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
      'moderator | admin | super_admin, or null to remove staff access',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  roleKey: string | null;

  @ApiProperty({ example: 'Joined the moderation team' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

// ────────────────────────────────────────────────────────────────── businesses

export class AdminBusinessQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name contains' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    enum: [
      'suggested',
      'pending_review',
      'published',
      'rejected',
      'suspended',
      'merged',
      'archived',
    ],
  })
  @IsOptional()
  @IsIn([
    'suggested',
    'pending_review',
    'published',
    'rejected',
    'suspended',
    'merged',
    'archived',
  ])
  status?: string;

  @ApiPropertyOptional({ enum: ['unclaimed', 'claim_pending', 'claimed'] })
  @IsOptional()
  @IsIn(['unclaimed', 'claim_pending', 'claimed'])
  ownership?: string;

  @ApiPropertyOptional({ description: 'Category slug' })
  @IsOptional()
  @Matches(SLUG)
  category?: string;

  @ApiPropertyOptional({ description: 'City slug' })
  @IsOptional()
  @Matches(SLUG)
  city?: string;
}

export class BusinessStatusDto {
  @ApiProperty({
    enum: ['pending_review', 'published', 'rejected', 'suspended', 'archived'],
    description:
      'Only PRD §7.4 transitions are allowed. Suspending / unsuspending needs business.suspend.',
  })
  @IsIn(['pending_review', 'published', 'rejected', 'suspended', 'archived'])
  status:
    | 'pending_review'
    | 'published'
    | 'rejected'
    | 'suspended'
    | 'archived';

  @ApiProperty({ example: 'Impersonating another vendor' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class NoindexDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  noindex: boolean;

  @ApiProperty({ example: 'Legal complaint received; under review' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class MergeBusinessDto {
  @ApiProperty({ description: 'The listing to keep' })
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
  'pending',
  'under_investigation',
  'reported',
  'evidence',
  'suspended',
  'removed',
] as const;

export class ReviewQueueQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_QUEUES, default: 'pending' })
  @IsOptional()
  @IsIn(REVIEW_QUEUES)
  queue?: (typeof REVIEW_QUEUES)[number];
}

export const REVIEW_ACTIONS = [
  'publish',
  'suspend',
  'remove',
  'restore',
  'investigate',
  'clear_investigation',
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export class ModerateReviewDto {
  @ApiProperty({
    enum: REVIEW_ACTIONS,
    description:
      'publish: release a held review. suspend: hide temporarily. remove: take down. restore: back to published. ' +
      'investigate / clear_investigation: moderator investigation status (excluded from the rating while investigated).',
  })
  @IsIn(REVIEW_ACTIONS)
  action: ReviewAction;

  @ApiProperty({
    enum: PolicyReason,
    example: PolicyReason.NO_VIOLATION,
    description: 'Recorded reason (PRD §8.2)',
  })
  @Transform(toUpperCase)
  @IsEnum(PolicyReason)
  reason: PolicyReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class EditReviewContentDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({
    maxLength: 5000,
    description: 'e.g. remove a phone number the reviewer included',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @ApiProperty({
    enum: PolicyReason,
    example: PolicyReason.PERSONAL_INFORMATION,
  })
  @Transform(toUpperCase)
  @IsEnum(PolicyReason)
  reason: PolicyReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class EvidenceStatusDto {
  @ApiProperty({
    enum: ['accepted', 'rejected'],
    description: 'accepted shows "Evidence reviewed" on the review',
  })
  @IsIn(['accepted', 'rejected'])
  status: 'accepted' | 'rejected';

  @ApiProperty({
    example: 'Receipt matches the date, amount and business name.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class RemoveResponseDto {
  @ApiProperty({ enum: PolicyReason, example: PolicyReason.HARASSMENT })
  @Transform(toUpperCase)
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
    enum: ['dismiss', 'suspend', 'remove', 'investigate'],
    description:
      'dismiss closes the report with no change. suspend/remove/investigate act on the reported review (or remove the reported response) and close every open report on it.',
  })
  @IsIn(['dismiss', 'suspend', 'remove', 'investigate'])
  decision: 'dismiss' | 'suspend' | 'remove' | 'investigate';

  @ApiProperty({ enum: PolicyReason, example: PolicyReason.NO_VIOLATION })
  @Transform(toUpperCase)
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
    enum: [
      'open',
      'under_review',
      'upheld',
      'review_actioned',
      'closed',
      'active',
    ],
    default: 'active',
  })
  @IsOptional()
  @IsIn([
    'open',
    'under_review',
    'upheld',
    'review_actioned',
    'closed',
    'active',
  ])
  status?: string;
}

export class DecideDisputeDto {
  @ApiProperty({
    enum: ['upheld', 'review_actioned', 'closed'],
    description:
      'upheld: the review stays as it is. review_actioned: a moderator edits, suspends or removes it (reviewAction). closed: closed without a decision on the review (e.g. withdrawn).',
  })
  @IsIn(['upheld', 'review_actioned', 'closed'])
  decision: 'upheld' | 'review_actioned' | 'closed';

  @ApiPropertyOptional({
    enum: ['edit', 'suspend', 'remove'],
    description: 'Required for review_actioned',
  })
  @IsOptional()
  @IsIn(['edit', 'suspend', 'remove'])
  reviewAction?: 'edit' | 'suspend' | 'remove';

  @ApiPropertyOptional({ description: 'reviewAction=edit: the corrected body' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  editedBody?: string;

  @ApiProperty({ enum: PolicyReason, example: PolicyReason.NO_VIOLATION })
  @Transform(toUpperCase)
  @IsEnum(PolicyReason)
  reason: PolicyReason;

  @ApiProperty({
    example:
      'The reviewer provided an order confirmation matching the experience described.',
    description: 'Recorded and sent to both parties',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note: string;
}

// ─────────────────────────────────────────────────────── categories & cities

export class CategoryDimensionInputDto {
  @ApiProperty({ example: 'delivery' })
  @IsString()
  @MaxLength(60)
  key: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  required: boolean;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Hotels and accommodation' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Parent category slug, or empty string to clear',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  parentSlug?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @ApiPropertyOptional({
    type: [CategoryDimensionInputDto],
    description: 'Replaces the dimensions, in display order',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CategoryDimensionInputDto)
  dimensions?: CategoryDimensionInputDto[];
}

export class CreateCategoryDto extends UpdateCategoryDto {
  @ApiProperty({ example: 'healthcare-providers' })
  @Matches(SLUG)
  @MaxLength(60)
  slug: string;

  @ApiProperty({ example: 'Healthcare providers' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare name: string;
}

export class UpdateDimensionDto {
  @ApiPropertyOptional({ example: 'Cleanliness' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateDimensionDto extends UpdateDimensionDto {
  @ApiProperty({ example: 'cleanliness' })
  @Matches(/^[a-z0-9]+(_[a-z0-9]+)*$/)
  @MaxLength(60)
  key: string;

  @ApiProperty({ example: 'Cleanliness' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  declare label: string;
}

export class UpdateCityDto {
  @ApiPropertyOptional({ example: 'Port Harcourt' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'Rivers' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateCityDto extends UpdateCityDto {
  @ApiProperty({ example: 'Port Harcourt' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare name: string;

  @ApiProperty({ example: 'Rivers' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare state: string;

  @ApiPropertyOptional({ example: 'NG', default: 'NG' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;
}

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: [
      'review',
      'business',
      'user',
      'suggestion',
      'claim',
      'report',
      'dispute',
      'category',
      'role',
    ],
  })
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

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class EmailLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'sent', 'failed'] })
  @IsOptional()
  @IsIn(['pending', 'sent', 'failed'])
  status?: string;
}
