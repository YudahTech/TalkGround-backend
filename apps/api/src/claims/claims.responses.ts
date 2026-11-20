import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DnsRecordDto {
  @ApiProperty({ example: 'TXT' }) type: string;
  @ApiProperty({ example: '@' }) host: string;
  @ApiProperty({ example: 'talkground-verification=3f2a…' }) value: string;
}

export class ClaimInstructionsDto {
  @ApiProperty() summary: string;
  @ApiPropertyOptional({ type: DnsRecordDto }) dnsRecord?: DnsRecordDto;
  @ApiPropertyOptional({ example: 'TG-1A2B3C4D' }) code?: string;
}

export class ClaimDocumentRefDto {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty() createdAt: Date;
}

export class ClaimBusinessRefDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
}

export class ClaimDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] }) status: string;
  @ApiProperty({
    enum: [
      'business_email',
      'website_domain',
      'social_account',
      'documents',
      'manual_review',
    ],
  })
  method: string;
  @ApiProperty() claimantRole: string;
  @ApiProperty({ nullable: true }) verificationTarget: string | null;
  @ApiProperty({ description: 'Email code or DNS record confirmed' })
  verificationConfirmed: boolean;
  @ApiProperty({ type: ClaimInstructionsDto, nullable: true })
  instructions: ClaimInstructionsDto | null;
  @ApiProperty({ type: [ClaimDocumentRefDto] })
  documents: ClaimDocumentRefDto[];
  @ApiProperty({
    nullable: true,
    description: 'The decision reason (always set on rejection)',
  })
  decisionReason: string | null;
  @ApiProperty({ type: ClaimBusinessRefDto }) business: ClaimBusinessRefDto;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true }) decidedAt: Date | null;
}

export class ClaimCreatedDto extends ClaimDto {
  @ApiPropertyOptional({ description: 'EMAIL_DEV_MODE only' }) devCode?: string;
  @ApiProperty({
    description:
      'Someone already manages this business; staff will review carefully',
  })
  alreadyManaged: boolean;
}

export class DomainCheckDto {
  @ApiProperty() verified: boolean;
  @ApiPropertyOptional() message?: string;
  @ApiPropertyOptional() expected?: string;
  @ApiPropertyOptional({ type: ClaimDto }) claim?: ClaimDto;
}

export class ClaimantDto {
  @ApiProperty() id: string;
  @ApiProperty() username: string;
  @ApiProperty() displayName: string;
  @ApiProperty() email: string;
}

export class AdminClaimListItemDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() method: string;
  @ApiProperty() verificationConfirmed: boolean;
  @ApiProperty() documentCount: number;
  @ApiProperty({ type: ClaimBusinessRefDto }) business: ClaimBusinessRefDto;
  @ApiProperty({ type: ClaimantDto }) claimant: ClaimantDto;
  @ApiProperty() createdAt: Date;
}

export class AdminClaimDocumentDto {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty() format: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ description: '10-minute signed URL (viewing is audited)' })
  viewUrl: string;
}

export class AdminClaimVerificationDto {
  @ApiProperty({ nullable: true }) target: string | null;
  @ApiProperty({ nullable: true }) confirmedAt: Date | null;
  @ApiPropertyOptional({
    description: 'SOCIAL_ACCOUNT: the code to look for in the bio',
  })
  codeToLookFor?: string;
  @ApiPropertyOptional({ description: 'WEBSITE_DOMAIN: the TXT record value' })
  expectedTxtRecord?: string;
}

export class AdminClaimDetailDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() method: string;
  @ApiProperty() claimantRole: string;
  @ApiProperty({ nullable: true }) message: string | null;
  @ApiProperty({ type: ClaimantDto }) claimant: ClaimantDto;
  @ApiProperty({ type: AdminClaimVerificationDto })
  verification: AdminClaimVerificationDto;
  @ApiProperty({ type: [AdminClaimDocumentDto] })
  documents: AdminClaimDocumentDto[];
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Business with ownership state and identifiers',
  })
  business: Record<string, unknown>;
  @ApiProperty({ type: [ClaimantDto] }) currentMembers: ClaimantDto[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  otherClaims: Record<string, unknown>[];
  @ApiProperty({ nullable: true }) decisionReason: string | null;
  @ApiProperty() createdAt: Date;
}

export class ClaimDecisionDto {
  @ApiProperty() claimId: string;
  @ApiProperty({ enum: ['approved', 'rejected'] }) status: string;
  @ApiPropertyOptional({ enum: ['claimed'] }) ownershipStatus?: string;
  @ApiPropertyOptional() ownershipVerified?: boolean;
}

export class OwnershipChangeDto {
  @ApiProperty() businessId: string;
  @ApiProperty({ enum: ['unclaimed', 'claimed'] }) ownershipStatus: string;
  @ApiProperty() ownershipVerified: boolean;
}
