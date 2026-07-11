import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ModerateReviewDto {
  @ApiProperty({
    enum: ['approve', 'suspend', 'remove', 'dismiss_report', 'verify_receipt'],
    example: 'approve',
  })
  @IsIn(['approve', 'suspend', 'remove', 'dismiss_report', 'verify_receipt'])
  action: string;

  @ApiPropertyOptional({ example: 'Looks legitimate' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Used with verify_receipt',
  })
  @IsOptional()
  @IsBoolean()
  approved?: boolean;
}

export class ResolveSuggestionDto {
  @ApiProperty({ enum: ['approved', 'rejected'], example: 'approved' })
  @IsIn(['approved', 'rejected'])
  status: 'approved' | 'rejected';

  @ApiPropertyOptional({ example: 'Added to catalog' })
  @IsOptional()
  @IsString()
  adminNote?: string;
}

export class SuspendUserDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  suspended: boolean;

  @ApiProperty({ example: 'Spam reviews', minLength: 1 })
  @IsString()
  @MinLength(1)
  reason: string;
}

export class AdminReviewQueueQueryDto {
  @ApiPropertyOptional({
    enum: ['flagged', 'reported', 'pending_receipt', 'suspended'],
    default: 'flagged',
    example: 'flagged',
  })
  @IsOptional()
  @IsIn(['flagged', 'reported', 'pending_receipt', 'suspended'])
  queue?: string = 'flagged';
}
