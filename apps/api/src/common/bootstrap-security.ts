import { Logger, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../auth/cookies';
import { envFlag } from './security';

const logger = new Logger('Security');

const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

/** CORS_ORIGIN may be a comma-separated list. Localhost is allowed unless CORS_ALLOW_LOCALHOST=false. */
export function allowedOrigins(): string[] {
  const configured = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const local = envFlag(process.env.CORS_ALLOW_LOCALHOST, true)
    ? LOCAL_ORIGINS
    : [];
  return [...new Set([...configured, ...local])];
}

/** Fail fast on configuration that would make the deployment insecure. */
export function checkSecurityConfig() {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  if (!secret) {
    // Without a secret the app falls back to a public default and anyone could forge tokens.
    if (isProd) throw new Error('JWT_SECRET is not set');
    logger.warn(
      'JWT_SECRET is not set — using an insecure development default',
    );
  } else if (secret.length < 32 || secret.startsWith('change-me')) {
    // Warn instead of crash so an existing deployment with a short secret keeps running.
    logger.warn(
      'JWT_SECRET is weak (<32 chars or a placeholder) — rotate it to 32+ random characters',
    );
  }
  if (envFlag(process.env.OTP_DEV_MODE, false)) {
    logger.warn(
      'OTP_DEV_MODE=true: SMS codes are returned in API responses. Phone verification is NOT secure.',
    );
  }
  if (envFlag(process.env.EMAIL_DEV_MODE, false)) {
    logger.warn(
      'EMAIL_DEV_MODE=true: email codes are returned in API responses. Email verification is NOT secure.',
    );
  }
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) {
    logger.warn(
      'BREVO_API_KEY / EMAIL_FROM not set: verification and password-reset emails will not be sent.',
    );
  }
  if (
    !process.env.TERMII_API_KEY &&
    !envFlag(process.env.OTP_DEV_MODE, false)
  ) {
    logger.warn('TERMII_API_KEY not set: phone OTP SMS cannot be sent.');
  }
}

/**
 * CSRF defence. Auth is cookie-only, so a state-changing request that carries our auth cookies
 * must come from an allowed Origin (or Referer), or from the API's own origin (Swagger UI at /docs).
 */
function csrfOriginCheck(origins: string[]) {
  const safe = new Set(['GET', 'HEAD', 'OPTIONS']);
  return (req: Request, res: Response, next: NextFunction) => {
    if (safe.has(req.method)) return next();
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    if (!cookies[ACCESS_COOKIE] && !cookies[REFRESH_COOKIE]) return next();

    const source = req.headers.origin ?? safeOrigin(req.headers.referer);
    if (source && origins.includes(source.replace(/\/$/, ''))) return next();
    if (source && isSameOrigin(source, req)) return next();

    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Cross-site request blocked (origin not allowed)',
      },
    });
  };
}

/** Same host as the API itself (e.g. Swagger UI served from /docs). */
function isSameOrigin(source: string, req: Request): boolean {
  try {
    return new URL(source).host === req.get('host');
  } catch {
    return false;
  }
}

function safeOrigin(referer?: string): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

export function applySecurity(app: INestApplication) {
  const express = app as NestExpressApplication;
  // Render terminates TLS at a proxy; trust its X-Forwarded-For so req.ip (rate limits, IP flags) is the client.
  express.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

  express.use(
    helmet({
      // JSON API + Swagger UI (inline scripts): a CSP adds nothing here and would break /docs.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  express.use(cookieParser());

  const origins = allowedOrigins();
  express.enableCors({ origin: origins, credentials: true });
  express.use(csrfOriginCheck(origins));
}
