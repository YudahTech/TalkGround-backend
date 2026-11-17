import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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
  @MaxLength(1000)
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

export class SetRoleDto {
  @ApiProperty({ enum: ['USER', 'MODERATOR', 'ADMIN'], example: 'MODERATOR' })
  @IsIn(['USER', 'MODERATOR', 'ADMIN'])
  role: 'USER' | 'MODERATOR' | 'ADMIN';
}

export class AdminUsersQueryDto {
  @ApiPropertyOptional({ example: 'chinedu', description: 'Search email, username or display name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class AuditLogQueryDto extends AdminUsersQueryDto {
  @ApiPropertyOptional({ enum: ['review', 'brand', 'user', 'suggestion', 'report'] })
  @IsOptional()
  @IsIn(['review', 'brand', 'user', 'suggestion', 'report'])
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}
