import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePass123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Ada Okafor', minLength: 2 })
  @IsString()
  @MinLength(2)
  displayName: string;

  @ApiProperty({
    example: 'ada_okafor',
    description: 'Lowercase letters, numbers, underscore; 3–30 chars',
  })
  @IsString()
  @Matches(/^[a-z0-9_]{3,30}$/)
  username: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'chinedu.okafor@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'demo1234' })
  @IsString()
  password: string;
}

export class ConfirmOtpDto {
  @ApiProperty({ example: '123456', description: '6-digit OTP from SMS / console' })
  @IsString()
  @Matches(/^\d{6}$/)
  otp: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}
