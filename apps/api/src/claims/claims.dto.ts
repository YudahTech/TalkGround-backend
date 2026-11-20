import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { VerificationMethod } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';
import { toUpperCase } from '../common/transforms';

export class CreateClaimDto {
  @ApiProperty({
    enum: VerificationMethod,
    example: VerificationMethod.SOCIAL_ACCOUNT,
    description:
      'BUSINESS_EMAIL: an address on the business website domain, or its listed email. WEBSITE_DOMAIN: add a DNS TXT record. ' +
      'SOCIAL_ACCOUNT: put a code in the bio of the listed Instagram/TikTok/Facebook/X account (works for Instagram-only vendors). ' +
      'DOCUMENTS: upload supporting documents (private). MANUAL_REVIEW: explain, and staff will contact you.',
  })
  @Transform(toUpperCase)
  @IsEnum(VerificationMethod)
  method: VerificationMethod;

  @ApiProperty({ example: 'Owner', description: 'Your role at the business' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  claimantRole: string;

  @ApiPropertyOptional({
    example: '@mamaput_lagos',
    description:
      'BUSINESS_EMAIL: the email. WEBSITE_DOMAIN: the domain. SOCIAL_ACCOUNT: the listed handle.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  verificationTarget?: string;

  @ApiPropertyOptional({
    example: 'I started the business in 2019. Call me on 0801 234 5678.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class ConfirmClaimCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class AddClaimDocumentDto {
  @ApiProperty({ example: 'CAC certificate' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label: string;

  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/authenticated/v1/talkground/claim-documents/abc.jpg',
    description: 'Upload first with folder "claim-documents" (private)',
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url: string;
}

export class ClaimListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';
}

export class ApproveClaimDto {
  @ApiProperty({
    example: true,
    description:
      'true only when the evidence was actually checked (code/DNS confirmed, documents examined, bio code seen). Sets business.ownershipVerified.',
  })
  @IsBoolean()
  ownershipVerified: boolean;

  @ApiProperty({
    example:
      'Saw code TG-1A2B3C4D in the @mamaput_lagos Instagram bio on 21 Nov.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Required when someone else already manages the business: revokes their access.',
  })
  @IsOptional()
  @IsBoolean()
  replaceExistingMembers?: boolean;
}

export class RejectClaimDto {
  @ApiProperty({
    example: 'The documents do not show this business name.',
    description: 'Shown to the claimant',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class SetOwnershipDto {
  @ApiProperty({ enum: ['unclaimed', 'claimed'] })
  @IsIn(['unclaimed', 'claimed'])
  ownershipStatus: 'unclaimed' | 'claimed';

  @ApiProperty({ example: false })
  @IsBoolean()
  ownershipVerified: boolean;

  @ApiProperty({ example: 'Owner asked us to remove their access.' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}
