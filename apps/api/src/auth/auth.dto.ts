import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  displayName: string;

  @IsString()
  @Matches(/^[a-z0-9_]{3,30}$/)
  username: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class ConfirmOtpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  otp: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}
