import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountDto } from '../users/users.responses';

/** Login/register/refresh/change-password. Tokens are only in HttpOnly cookies, never here. */
export class SessionDto {
  @ApiProperty({ type: AccountDto }) user: AccountDto;
  @ApiProperty({
    example: 900,
    description: 'Seconds until the access cookie expires (max 15 minutes)',
  })
  expiresIn: number;
  @ApiProperty({ description: 'When the refresh cookie expires' })
  refreshTokenExpiresAt: Date;
  @ApiPropertyOptional() message?: string;
  @ApiPropertyOptional({ description: 'EMAIL_DEV_MODE only' })
  devEmailCode?: string;
}

export class CodeSentDto {
  @ApiProperty({ example: 'Verification code sent' }) message: string;
  @ApiPropertyOptional({ description: 'Dev modes only' }) devCode?: string;
}

export class AccountResultDto {
  @ApiProperty({ type: AccountDto }) user: AccountDto;
}
