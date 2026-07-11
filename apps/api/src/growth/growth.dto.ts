import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { City, PrimaryUse } from '@prisma/client';

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

  @ApiProperty({ enum: City, example: City.LAGOS })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city: City;

  @ApiProperty({
    enum: PrimaryUse,
    example: PrimaryUse.BOTH,
    description:
      'Also accepts lowercase: restaurants | hotels | both | write_reviews',
  })
  @Transform(({ value }) => {
    const map: Record<string, PrimaryUse> = {
      restaurants: PrimaryUse.RESTAURANTS,
      hotels: PrimaryUse.HOTELS,
      both: PrimaryUse.BOTH,
      write_reviews: PrimaryUse.WRITE_REVIEWS,
    };
    return map[value as string] ?? value;
  })
  @IsEnum(PrimaryUse)
  primaryUse: PrimaryUse;

  @ApiPropertyOptional({ example: 'twitter' })
  @IsOptional()
  @IsString()
  attribution?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  consentGiven: boolean;
}
