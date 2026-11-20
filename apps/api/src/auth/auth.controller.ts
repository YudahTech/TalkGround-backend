import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ConfirmOtpDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RegisterDto,
  ResetPasswordDto,
  SendPhoneOtpDto,
} from './auth.dto';
import { OptionalAuth, Public } from '../common/decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { SWAGGER_COOKIE_AUTH } from '../common/swagger';
import {
  clearSessionCookies,
  readCookie,
  REFRESH_COOKIE,
  setSessionCookies,
  withoutTokens,
} from './cookies';

const MINUTE = 60_000;

/**
 * Cookie-only sessions. login / register / refresh / change-password set two HttpOnly cookies:
 *  - talkground_at  (access JWT, path /)
 *  - talkground_rt  (rotating refresh token, path /api/v1/auth)
 * Tokens are never returned in the JSON body and Bearer headers are not accepted.
 * Browsers must call the API with credentials: 'include'.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @ApiOperation({
    summary: 'Register (public). Sends a 6-digit email verification code.',
    description:
      'Sets the HttpOnly session cookies and returns { data: { user, expiresIn, refreshTokenExpiresAt, message } }. ' +
      'With EMAIL_DEV_MODE=true also returns devEmailCode.',
  })
  @ApiBody({ type: RegisterDto })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.auth.register(dto);
    setSessionCookies(res, data);
    return { data: withoutTokens(data) };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Login (public). 10 failed attempts lock the account for 15 minutes.',
    description:
      'Sets the HttpOnly session cookies and returns { data: { user, expiresIn, refreshTokenExpiresAt } }. ' +
      'Demo: chinedu.okafor@gmail.com / demo1234 — Admin: admin@revyu.ng / admin123',
  })
  @ApiBody({ type: LoginDto })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.auth.login(dto);
    setSessionCookies(res, data);
    return { data: withoutTokens(data) };
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Rotate the session cookies using the talkground_rt cookie (no body)',
    description:
      'Reads the HttpOnly talkground_rt cookie and sets fresh talkground_at + talkground_rt cookies. ' +
      'The old refresh token stops working. Replaying an already-used refresh token signs the user out everywhere. ' +
      'On failure (401) both cookies are cleared.',
  })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const data = await this.auth.refresh(readCookie(req, REFRESH_COOKIE));
      setSessionCookies(res, data);
      return { data: withoutTokens(data) };
    } catch (err) {
      clearSessionCookies(res);
      throw err;
    }
  }

  @OptionalAuth()
  @HttpCode(200)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary:
      'Logout: revokes the refresh token and invalidates current access tokens',
    description: 'allDevices=true also revokes every other session.',
  })
  @ApiBody({ type: LogoutDto })
  @Post('logout')
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: AuthUser | null,
  ) {
    const data = await this.auth.logout(
      readCookie(req, REFRESH_COOKIE),
      user?.id,
      dto.allDevices ?? false,
    );
    clearSessionCookies(res);
    return { data };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Email a password reset link (public; same response whether or not the email exists)',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto).then((data) => ({ data }));
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Set a new password with the token from the reset link (signs out all sessions)',
  })
  @ApiBody({ type: ResetPasswordDto })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto).then((data) => ({ data }));
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Change password (JWT). Signs out other sessions and returns a new session.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.auth.changePassword(user.id, dto);
    setSessionCookies(res, data);
    return { data: withoutTokens(data) };
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Send email verification code (JWT). EMAIL_DEV_MODE=true returns devCode.',
  })
  @Post('verify-email/send-code')
  sendEmailCode(@CurrentUser() user: AuthUser) {
    return this.auth.sendEmailCode(user.id).then((data) => ({ data }));
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({ summary: 'Confirm email verification code (JWT)' })
  @ApiBody({ type: ConfirmOtpDto })
  @Post('verify-email/confirm')
  confirmEmail(@CurrentUser() user: AuthUser, @Body() dto: ConfirmOtpDto) {
    return this.auth.confirmEmailCode(user.id, dto).then((data) => ({ data }));
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @Throttle({ default: { limit: 3, ttl: MINUTE } })
  @ApiOperation({
    summary:
      'Send phone OTP by SMS (JWT). Optional { phone } sets/changes the number.',
    description:
      'OTP_DEV_MODE=true skips SMS and returns devCode (testing only).',
  })
  @ApiBody({ type: SendPhoneOtpDto, required: false })
  @Post('verify-phone/send-otp')
  sendOtp(@CurrentUser() user: AuthUser, @Body() dto: SendPhoneOtpDto) {
    return this.auth
      .sendPhoneOtp(user.id, dto?.phone)
      .then((data) => ({ data }));
  }

  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({
    summary: 'Confirm phone OTP (JWT). 5 wrong attempts invalidate the code.',
  })
  @ApiBody({ type: ConfirmOtpDto })
  @Post('verify-phone/confirm-otp')
  confirmOtp(@CurrentUser() user: AuthUser, @Body() dto: ConfirmOtpDto) {
    return this.auth.confirmPhoneOtp(user.id, dto).then((data) => ({ data }));
  }
}
