import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangePasswordDto,
  ConfirmOtpDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { generateOtp } from '../common/utils';
import {
  durationToMs,
  envFlag,
  hmacCode,
  randomToken,
  safeEqualHex,
  sha256,
} from '../common/security';
import { SmsService } from './sms.service';
import { EmailService } from '../email/email.service';

export const BCRYPT_COST = 12;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TTL_MS = 30 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
/** Compared against when the email doesn't exist, so response time doesn't reveal registered emails. */
const DUMMY_HASH = bcrypt.hashSync('revyu-timing-equaliser', BCRYPT_COST);

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private sms: SmsService,
    private email: EmailService,
  ) {}

  // ---------------------------------------------------------------- helpers

  sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      phone: user.phone,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      city: user.city ? user.city.toLowerCase() : null,
    };
  }

  private get secret(): string {
    return this.config.get<string>('JWT_SECRET', 'dev-secret');
  }

  accessTtlMs(): number {
    return durationToMs(this.config.get<string>('JWT_EXPIRES_IN', '15m'));
  }

  refreshTtlMs(): number {
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', '30'));
    return (Number.isFinite(days) && days > 0 ? days : 30) * 86_400_000;
  }

  private otpDevMode() {
    return envFlag(this.config.get('OTP_DEV_MODE'), false);
  }

  private emailDevMode() {
    return envFlag(this.config.get('EMAIL_DEV_MODE'), false);
  }

  /** Issue a short-lived access JWT plus a rotating, DB-backed refresh token. */
  async issueSession(
    user: Pick<User, 'id' | 'tokenVersion'>,
  ): Promise<Session> {
    const expiresInMs = this.accessTtlMs();
    const accessToken = this.jwt.sign(
      { sub: user.id, ver: user.tokenVersion },
      { expiresIn: Math.floor(expiresInMs / 1000) },
    );
    const refreshToken = randomToken(48);
    const refreshTokenExpiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshTokenExpiresAt,
      },
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(expiresInMs / 1000),
      refreshTokenExpiresAt,
    };
  }

  /** Sign the user out everywhere: revoke refresh tokens and invalidate outstanding access tokens. */
  async revokeAllSessions(userId: string) {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);
  }

  // ------------------------------------------------------------ register/login

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('Email or username already taken');
    }

    const phone = dto.phone ? this.sms.normalizePhone(dto.phone) : undefined;
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: dto.displayName,
        username: dto.username,
        phone,
        emailVerified: false,
      },
    });

    // Best effort: a failed email must not fail signup — the user can resend.
    const emailCode = await this.issueEmailCode(user).catch((err) => {
      this.logger.error('Failed to send verification email on signup', err);
      return null;
    });

    const session = await this.issueSession(user);
    return {
      ...session,
      user: this.sanitizeUser(user),
      message:
        'Account created. Check your email for a 6-digit verification code.',
      ...(emailCode?.devCode ? { devEmailCode: emailCode.devCode } : {}),
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    });
    if (!user) {
      // Equalise timing with the real path so account existence isn't leaked.
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        'Too many failed attempts. Try again in 15 minutes or reset your password.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data:
          failed >= MAX_FAILED_LOGINS
            ? {
                failedLoginCount: 0,
                lockedUntil: new Date(Date.now() + LOCKOUT_MS),
              }
            : { failedLoginCount: failed },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.suspended) {
      throw new ForbiddenException('This account has been suspended');
    }

    const fresh = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    const session = await this.issueSession(fresh);
    return { ...session, user: this.sanitizeUser(fresh) };
  }

  // -------------------------------------------------------- refresh / logout

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token missing');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      // A revoked token was replayed: treat as theft and kill every session for this user.
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}`,
      );
      await this.revokeAllSessions(stored.userId);
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    if (stored.user.suspended || stored.user.deletedAt) {
      throw new UnauthorizedException('Account unavailable');
    }

    // Rotate: the presented token is single-use.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    const session = await this.issueSession(stored.user);
    return { ...session, user: this.sanitizeUser(stored.user) };
  }

  async logout(
    refreshToken: string | undefined,
    userId: string | undefined,
    allDevices: boolean,
  ) {
    let ownerId = userId;
    if (refreshToken) {
      const stored = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: sha256(refreshToken) },
      });
      if (stored) {
        ownerId = ownerId ?? stored.userId;
        await this.prisma.refreshToken.updateMany({
          where: { id: stored.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }

    if (ownerId) {
      if (allDevices) {
        await this.revokeAllSessions(ownerId);
      } else {
        // Invalidate outstanding access tokens (they carry the old tokenVersion).
        // Other devices keep their refresh tokens and transparently get a new access token.
        await this.prisma.user.update({
          where: { id: ownerId },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    }
    return { message: 'Logged out' };
  }

  // ------------------------------------------------------------- one-time codes

  private async createCode(
    userId: string,
    purpose: OtpPurpose,
  ): Promise<string> {
    const code = generateOtp();
    await this.prisma.$transaction([
      // Only the newest code is valid.
      this.prisma.otpCode.updateMany({
        where: { userId, purpose, used: false },
        data: { used: true },
      }),
      this.prisma.otpCode.create({
        data: {
          userId,
          purpose,
          code: hmacCode(code, this.secret),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      }),
    ]);
    return code;
  }

  private async consumeCode(userId: string, purpose: OtpPurpose, code: string) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { userId, purpose, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException('Code expired. Request a new one.');

    if (!safeEqualHex(otp.code, hmacCode(code, this.secret))) {
      const attempts = otp.attempts + 1;
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts, used: attempts >= OTP_MAX_ATTEMPTS },
      });
      throw new BadRequestException(
        attempts >= OTP_MAX_ATTEMPTS
          ? 'Too many wrong attempts. Request a new code.'
          : 'Invalid code',
      );
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { used: true },
    });
  }

  // ---------------------------------------------------------- phone verification

  async sendPhoneOtp(userId: string, newPhone?: string) {
    let user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (newPhone) {
      const phone = this.sms.normalizePhone(newPhone);
      if (phone !== user.phone) {
        user = await this.prisma.user.update({
          where: { id: userId },
          data: { phone, phoneVerified: false },
        });
      }
    }
    if (!user.phone) {
      throw new BadRequestException(
        'Add a phone number first (send { "phone": "+234…" })',
      );
    }
    if (user.phoneVerified) {
      return { message: 'Phone already verified' };
    }

    const code = await this.createCode(userId, OtpPurpose.PHONE);
    if (this.otpDevMode()) {
      this.logger.log(`[DEV OTP] user=${userId} code=${code}`);
      return {
        message: 'OTP generated (dev mode — not sent by SMS)',
        devCode: code,
      };
    }

    const sent = await this.sms.sendOtp(user.phone, code);
    if (!sent)
      throw new ServiceUnavailableException(
        'Failed to send SMS. Try again later.',
      );
    return { message: 'OTP sent' };
  }

  async confirmPhoneOtp(userId: string, dto: ConfirmOtpDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.phone) throw new BadRequestException('Add a phone number first');

    await this.consumeCode(userId, OtpPurpose.PHONE, dto.otp);

    // One verified phone per account, to make bulk fake accounts expensive.
    const taken = await this.prisma.user.findFirst({
      where: {
        phone: user.phone,
        phoneVerified: true,
        id: { not: userId },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException(
        'This phone number is already verified on another account',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { phoneVerified: true },
    });
    return { user: this.sanitizeUser(updated) };
  }

  // ---------------------------------------------------------- email verification

  private async issueEmailCode(user: User): Promise<{ devCode?: string }> {
    const code = await this.createCode(user.id, OtpPurpose.EMAIL);
    const sent = await this.email.verificationCode(
      user.email,
      user.displayName,
      code,
    );
    if (this.emailDevMode()) {
      this.logger.log(`[DEV EMAIL CODE] user=${user.id} code=${code}`);
      return { devCode: code };
    }
    if (!sent)
      throw new ServiceUnavailableException(
        'Failed to send email. Try again later.',
      );
    return {};
  }

  async sendEmailCode(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.emailVerified) return { message: 'Email already verified' };
    const result = await this.issueEmailCode(user);
    return { message: 'Verification code sent', ...result };
  }

  async confirmEmailCode(userId: string, dto: ConfirmOtpDto) {
    await this.consumeCode(userId, OtpPurpose.EMAIL, dto.otp);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
    return { user: this.sanitizeUser(updated) };
  }

  // ------------------------------------------------------------------ passwords

  async forgotPassword(dto: ForgotPasswordDto) {
    const generic = { message: 'If that email exists, a reset link was sent' };
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: dto.email.trim(), mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (!user || user.suspended) return generic;

    const token = randomToken(32);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    ]);

    const base = (
      this.config.get<string>('FRONTEND_URL') ??
      (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000').split(
        ',',
      )[0]
    ).replace(/\/$/, '');
    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;

    const sent = await this.email.passwordReset(
      user.email,
      user.displayName,
      link,
    );
    if (!sent && this.emailDevMode()) {
      // Never returned in the HTTP response (that would allow account takeover) — logs only.
      this.logger.log(`[DEV RESET LINK] ${link}`);
    }
    return generic;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(dto.token) },
      include: { user: true },
    });
    if (
      !stored ||
      stored.usedAt ||
      stored.expiresAt < new Date() ||
      stored.user.deletedAt
    ) {
      throw new BadRequestException(
        'This reset link is invalid or has expired',
      );
    }

    const claimed = await this.prisma.passwordResetToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        'This reset link is invalid or has expired',
      );
    }

    await this.prisma.user.update({
      where: { id: stored.userId },
      data: {
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_COST),
        failedLoginCount: 0,
        lockedUntil: null,
        // Receiving the reset email proves control of the address.
        emailVerified: true,
      },
    });
    await this.revokeAllSessions(stored.userId);
    void this.email.passwordChanged(stored.user.email, stored.user.displayName);
    return {
      message: 'Password updated. Please log in with your new password.',
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_COST) },
    });
    await this.revokeAllSessions(userId);
    void this.email.passwordChanged(user.email, user.displayName);
    const fresh = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const session = await this.issueSession(fresh);
    return {
      ...session,
      user: this.sanitizeUser(fresh),
      message: 'Password changed',
    };
  }
}
