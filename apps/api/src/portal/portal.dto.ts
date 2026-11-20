import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ReportReason } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';
import { toUpperCase } from '../common/transforms';

export class ResponseBodyDto {
  @ApiProperty({
    example:
      "Thank you for the feedback, Ada. We're sorry the delivery was late — our dispatch partner had issues that week. We've since switched couriers.",
    minLength: 10,
    maxLength: 3000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  body: string;
}

export class ProposeResolutionDto {
  @ApiProperty({
    example:
      'We sent a replacement dress on 12 Nov and offered a full refund of the delivery fee.',
    maxLength: 500,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  note: string;
}

export class CreateDisputeDto {
  @ApiProperty({ enum: ReportReason, example: ReportReason.FALSE_EXPERIENCE })
  @Transform(toUpperCase)
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiProperty({
    example:
      'We have no order from this customer: no matching name, phone number or payment in our records for October.',
    minLength: 30,
    maxLength: 3000,
  })
  @IsString()
  @MinLength(30)
  @MaxLength(3000)
  details: string;
}

export class PortalReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['all', 'unanswered', 'complaints', 'unresolved'],
    default: 'all',
    description:
      'complaints = 1–2 stars; unresolved = complaints not reported resolved by the reviewer',
  })
  @IsOptional()
  @IsIn(['all', 'unanswered', 'complaints', 'unresolved'])
  filter?: 'all' | 'unanswered' | 'complaints' | 'unresolved';
}
