import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { City, ReviewInterest } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Chinedu Okafor', minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({
    example: 'Food lover exploring Lagos & Abuja.',
    maxLength: 280,
  })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/avatar.jpg',
  })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: City, example: City.LAGOS })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city?: City;

  @ApiPropertyOptional({
    enum: ReviewInterest,
    isArray: true,
    example: [ReviewInterest.RESTAURANTS],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ReviewInterest, { each: true })
  interests?: ReviewInterest[];
}
