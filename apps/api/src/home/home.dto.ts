import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BrandCategory, City } from '@prisma/client';

export class HomeQueryDto {
  @ApiPropertyOptional({ example: 'jollof', description: 'Optional search' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: BrandCategory,
    description: 'Or pass lowercase restaurants|hotels — API normalizes',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(BrandCategory)
  category?: BrandCategory;

  @ApiPropertyOptional({ enum: City })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(City)
  city?: City;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  @ApiPropertyOptional({
    example: 4,
    description: 'Popular sectors grid size (default 4)',
    minimum: 1,
    maximum: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  sectorLimit?: number;
}
