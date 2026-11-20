import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  MaxLength,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class SurveyResponseDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { q1: 'restaurants', q2: 'lagos' },
    description: 'Free-form survey answers map',
  })
  @IsObject()
  answers: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'lagos' })
  @IsOptional()
  @IsString()
  city?: string;
}

export class WaitlistDto {
  @ApiProperty({ example: 'Ada Okafor' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'lagos', description: 'City or state (free text)' })
  @IsString()
  @MaxLength(80)
  city: string;

  @ApiProperty({
    enum: ['find_businesses', 'write_reviews', 'manage_my_business', 'all'],
    example: 'find_businesses',
  })
  @IsIn(['find_businesses', 'write_reviews', 'manage_my_business', 'all'])
  primaryUse: string;

  @ApiPropertyOptional({ example: 'twitter' })
  @IsOptional()
  @IsString()
  attribution?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  consentGiven: boolean;
}
