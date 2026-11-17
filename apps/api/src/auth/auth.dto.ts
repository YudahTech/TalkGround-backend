import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'securePass123', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignores bytes beyond 72
  password: string;

  @ApiProperty({ example: 'Ada Okafor', minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName: string;

  @ApiProperty({
    example: 'ada_okafor',
    description: 'Lowercase letters, numbers, underscore; 3–30 chars',
  })
  @IsString()
  @Matches(/^[a-z0-9_]{3,30}$/)
  username: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'Nigerian mobile; stored as +234…',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'chinedu.okafor@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'demo1234' })
  @IsString()
  @MaxLength(72)
  password: string;
}

export class ConfirmOtpDto {
  @ApiProperty({
    example: '123456',
    description: '6-digit code from SMS or email',
  })
  @IsString()
  @Matches(/^\d{6}$/)
  otp: string;
}

export class SendPhoneOtpDto {
  @ApiPropertyOptional({
    example: '+2348012345678',
    description:
      'Optional: set or change the phone number first (resets phoneVerified)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the reset link (?token=…)' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @ApiProperty({ example: 'newSecurePass123', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'oldPass123' })
  @IsString()
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ example: 'newSecurePass123', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}

export class RefreshDto {
  @ApiPropertyOptional({
    description:
      'Refresh token from login/register/refresh. Optional when the HttpOnly talkground_rt cookie is sent.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class LogoutDto extends RefreshDto {
  @ApiPropertyOptional({
    example: false,
    description: 'Also revoke every other device',
  })
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}
