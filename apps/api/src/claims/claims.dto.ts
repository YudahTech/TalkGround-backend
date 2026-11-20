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
    example: VerificationMethod.BUSINESS_EMAIL,
    description:
      'BUSINESS_EMAIL: an address on the business website domain, or its listed public email. ' +
      'WEBSITE_DOMAIN: add a DNS TXT record. SOCIAL_ACCOUNT: put a code in the bio of the listed social account. ' +
      'DOCUMENTS: upload CAC certificate or similar (private). MANUAL_REVIEW: explain and staff will contact you.',
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
    example: 'kemi@kemiscloset.ng',
    description:
      'BUSINESS_EMAIL: the email address. WEBSITE_DOMAIN: the domain (e.g. kemiscloset.ng). SOCIAL_ACCOUNT: the handle (e.g. @kemis_closet).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  verificationTarget?: string;

  @ApiPropertyOptional({
    example: 'I founded the business in 2019. Reach me on 0801 234 5678.',
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
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
  })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled'])
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export class ApproveClaimDto {
  @ApiProperty({
    enum: ['claimed', 'verified'],
    description:
      'claimed = the claimant may manage the profile; verified = control of the business was actually proven (shows "Ownership verified").',
  })
  @IsIn(['claimed', 'verified'])
  ownership: 'claimed' | 'verified';

  @ApiProperty({
    example:
      'Confirmed code sent to kemi@kemiscloset.ng and CAC certificate RC123456.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Required when someone else already manages the business: revokes their access.',
  })
  @IsOptional()
  @IsBoolean()
  replaceExistingManagers?: boolean;
}

export class RejectClaimDto {
  @ApiProperty({ example: 'The documents do not show this business name.' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note: string;
}

export class SetOwnershipDto {
  @ApiProperty({ enum: ['unclaimed', 'claimed', 'verified'] })
  @IsIn(['unclaimed', 'claimed', 'verified'])
  status: 'unclaimed' | 'claimed' | 'verified';

  @ApiProperty({ example: 'Owner asked us to remove their access.' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note: string;
}
