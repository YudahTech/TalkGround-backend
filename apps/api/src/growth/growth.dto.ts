import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { City, PrimaryUse } from '@prisma/client';

export class SurveyResponseDto {
  @IsObject()
  answers: Record<string, unknown>;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class WaitlistDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city: City;

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

  @IsOptional()
  @IsString()
  attribution?: string;

  @IsBoolean()
  consentGiven: boolean;
}
