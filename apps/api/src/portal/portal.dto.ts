import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';

export class ResponseBodyDto {
  @ApiProperty({
    example:
      "Thank you for the feedback, Ada. We're sorry the delivery was late — our dispatch partner had issues that week, and we've since switched couriers.",
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
    example: 'We sent a replacement on 12 Nov and refunded the delivery fee.',
    maxLength: 500,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  note: string;
}

export class CreateDisputeDto {
  @ApiProperty({
    example:
      'We have no order from this customer: no matching name, phone number or payment in our records for October.',
    minLength: 30,
    maxLength: 3000,
    description:
      'Written reason (PRD §8.4). Staff assess it against the review and the available evidence.',
  })
  @IsString()
  @MinLength(30)
  @MaxLength(3000)
  reason: string;
}

export class PortalReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['all', 'unanswered', 'complaints', 'unresolved'],
    default: 'all',
    description:
      'complaints = 1–2 stars; unresolved = complaints the reviewer has not marked resolved',
  })
  @IsOptional()
  @IsIn(['all', 'unanswered', 'complaints', 'unresolved'])
  filter?: 'all' | 'unanswered' | 'complaints' | 'unresolved';
}
