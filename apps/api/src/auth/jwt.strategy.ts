import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_COOKIE, readCookie } from './cookies';

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

  async validate(payload: { sub: string; ver?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.suspended || user.deletedAt) {
      throw new UnauthorizedException('Account unavailable');
    }
    // Tokens issued before logout / password change / suspension carry an older version.
    // Tokens minted before this field existed have no `ver` and are treated as version 0.
    if ((payload.ver ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };
  }
}
