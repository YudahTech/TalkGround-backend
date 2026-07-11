import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  ConfirmOtpDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
} from './auth.dto';
import { Public } from '../common/decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { SWAGGER_BEARER_AUTH } from '../common/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @ApiOperation({ summary: 'Register a new account (public)' })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto).then((data) => ({ data }));
  }

  @Public()
  @ApiOperation({ summary: 'Login and receive JWT (public)' })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto).then((data) => ({ data }));
  }

  @Public()
  @ApiOperation({ summary: 'Request password reset (public, email not implemented)' })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto).then((data) => ({ data }));
  }

  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Send phone OTP (JWT required). Dev: OTP_DEV_MODE=true logs code to console.' })
  @Post('verify-phone/send-otp')
  sendOtp(@CurrentUser() user: { id: string }) {
    return this.auth.sendPhoneOtp(user.id).then((data) => ({ data }));
  }

  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Confirm phone OTP (JWT required)' })
  @Post('verify-phone/confirm-otp')
  confirmOtp(@CurrentUser() user: { id: string }, @Body() dto: ConfirmOtpDto) {
    return this.auth.confirmPhoneOtp(user.id, dto).then((data) => ({ data }));
  }
}
