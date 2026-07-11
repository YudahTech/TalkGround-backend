import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmOtpDto, ForgotPasswordDto, LoginDto, RegisterDto } from './auth.dto';
import { generateOtp } from '../common/utils';
import { SmsService } from './sms.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private sms: SmsService,
  ) {}

  private sanitizeUser(user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    role: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    avatarUrl?: string | null;
    bio?: string | null;
    city?: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      city: user.city ? user.city.toLowerCase() : null,
    };
  }

  private signToken(userId: string) {
    const accessToken = this.jwt.sign({ sub: userId });
    return { accessToken, refreshToken: accessToken };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });
    if (existing) {
      throw new ConflictException('Email or username already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        username: dto.username,
        phone: dto.phone,
        emailVerified: true,
      },
    });

    const tokens = this.signToken(user.id);
    return {
      ...tokens,
      user: this.sanitizeUser(user),
      message: 'Account created. You can write reviews after logging in.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = this.signToken(user.id);
    return { ...tokens, user: this.sanitizeUser(user) };
  }

  async sendPhoneOtp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.phone) {
      throw new UnauthorizedException('Add a phone number to your account first');
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { userId, code, expiresAt },
    });

    const sent = await this.sms.sendOtp(user.phone, code);
    if (!sent && this.config.get('OTP_DEV_MODE') !== 'true') {
      throw new UnauthorizedException('Failed to send OTP. Try again later.');
    }

    return { message: 'OTP sent' };
  }

  async confirmPhoneOtp(userId: string, dto: ConfirmOtpDto) {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        userId,
        code: dto.otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp && this.config.get('OTP_DEV_MODE') !== 'true') {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    if (otp) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { used: true },
      });
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { phoneVerified: true },
    });

    return { user: this.sanitizeUser(user) };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      return { message: 'If that email exists, a reset link was sent' };
    }
    console.log(`[DEV] Password reset requested for ${dto.email}`);
    return { message: 'If that email exists, a reset link was sent' };
  }
}
