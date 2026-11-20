import type { CookieOptions, Request, Response } from 'express';
import { envFlag } from '../common/security';
import type { Session } from './auth.service';

export const ACCESS_COOKIE = 'talkground_at';
export const REFRESH_COOKIE = 'talkground_rt';
const REFRESH_PATH = '/api/v1/auth';

/**
 * Cookie settings.
 * - COOKIE_SECURE   (default: true when NODE_ENV=production)
 * - COOKIE_SAMESITE (lax | strict | none; default lax). A web app on a different site
 *   from the API (e.g. *.vercel.app → *.onrender.com) needs `none` + Secure.
 * - COOKIE_DOMAIN   (optional, e.g. .yourdomain.com to share between app. and api.)
 */
function baseOptions(): CookieOptions {
  const sameSite = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase() as
    | 'lax'
    | 'strict'
    | 'none';
  const secure =
    envFlag(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production') ||
    sameSite === 'none';
  return {
    httpOnly: true,
    secure,
    sameSite,
    domain: process.env.COOKIE_DOMAIN || undefined,
  };
}

export function setSessionCookies(res: Response, session: Session) {
  const opts = baseOptions();
  res.cookie(ACCESS_COOKIE, session.accessToken, {
    ...opts,
    path: '/',
    maxAge: session.expiresIn * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...opts,
    path: REFRESH_PATH,
    expires: session.refreshTokenExpiresAt,
  });
}

export function clearSessionCookies(res: Response) {
  const opts = baseOptions();
  res.clearCookie(ACCESS_COOKIE, { ...opts, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...opts, path: REFRESH_PATH });
}

export function readCookie(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, string> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Tokens never leave the server in a response body � they live only in HttpOnly cookies.
 * Strips them from a session object before it is returned as JSON.
 */
export function withoutTokens<T extends Session>(
  session: T,
): Omit<T, 'accessToken' | 'refreshToken'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessToken, refreshToken, ...rest } = session;
  return rest;
}
