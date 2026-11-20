import { ApiProperty } from '@nestjs/swagger';
import {
  CategoryRefDto,
  CityRefDto,
  DuplicateCandidateDto,
} from '../businesses/businesses.responses';

export class SubmissionIdentifierDto {
  @ApiProperty({ example: 'INSTAGRAM' }) type: string;
  @ApiProperty({ example: '@mamaput_lagos' }) value: string;
}

export class BusinessLinkDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
}

export class SubmissionDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['consumer', 'owner'] }) source: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: CategoryRefDto }) category: CategoryRefDto;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) website: string | null;
  @ApiProperty({ type: CityRefDto, nullable: true }) city: CityRefDto | null;
  @ApiProperty({ nullable: true }) area: string | null;
  @ApiProperty() onlineOnly: boolean;
  @ApiProperty({ type: [SubmissionIdentifierDto] })
  identifiers: SubmissionIdentifierDto[];
  @ApiProperty({ nullable: true }) ownerRole: string | null;
  @ApiProperty({ enum: ['pending_review', 'approved', 'rejected', 'merged'] })
  status: string;
  @ApiProperty({
    nullable: true,
    description: 'Reason shown to the submitter after a decision',
  })
  adminNote: string | null;
  @ApiProperty({ type: BusinessLinkDto, nullable: true })
  business: BusinessLinkDto | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true }) reviewedAt: Date | null;
}

export class SubmissionCreatedDto extends SubmissionDto {
  @ApiProperty() message: string;
  @ApiProperty({
    type: [BusinessLinkDto],
    description:
      'Published listings that may be the same business ("Is it one of these?")',
  })
  possibleMatches: BusinessLinkDto[];
}

export class SubmitterDto {
  @ApiProperty() id: string;
  @ApiProperty() username: string;
  @ApiProperty() displayName: string;
}

export class AdminSubmissionDto extends SubmissionDto {
  @ApiProperty({ type: SubmitterDto }) submittedBy: SubmitterDto;
  @ApiProperty({ type: [String] }) possibleDuplicateIds: string[];
}

export class AdminSubmissionDetailDto extends AdminSubmissionDto {
  @ApiProperty({
    type: [DuplicateCandidateDto],
    description: 'Recomputed now (signals for staff, never automatic)',
  })
  duplicateCandidates: DuplicateCandidateDto[];
}

export class SubmissionDecisionDto {
  @ApiProperty() submissionId: string;
  @ApiProperty({ enum: ['approved', 'rejected', 'merged'] }) status: string;
  @ApiProperty({ type: BusinessLinkDto, nullable: true })
  business: BusinessLinkDto | null;
}
