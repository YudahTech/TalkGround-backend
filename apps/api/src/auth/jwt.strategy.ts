import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_COOKIE, readCookie } from './cookies';
import type { AuthUser } from '../common/current-user.decorator';

/**
 * Cookie-only auth: the access JWT is read from the HttpOnly `talkground_at` cookie.
 * `Authorization: Bearer` headers are deliberately ignored.
 */
export const extractAccessToken = (req: Request): string | null =>
  readCookie(req, ACCESS_COOKIE) ?? null;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractAccessToken,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  async validate(payload: { sub: string; ver?: number }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { adminRole: { select: { key: true, permissions: true } } },
    });
    if (!user || user.suspended || user.deletedAt) {
      throw new UnauthorizedException('Account unavailable');
    }
    // Tokens issued before logout / password change / suspension carry an older version.
    // Tokens minted before this field existed have no `ver` and are treated as version 0.
    if ((payload.ver ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    // Permissions are read from the database on every request, so revoking a staff role
    // takes effect immediately rather than when the access token expires.
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      isStaff: !!user.adminRole,
      adminRole: user.adminRole?.key ?? null,
      permissions: user.adminRole?.permissions ?? [],
    };
  }
}
