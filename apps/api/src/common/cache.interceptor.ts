import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from './decorators';
import { AppConfig } from './app-config';
import { ACCESS_COOKIE } from '../auth/cookies';

/**
 * PRD v2.5 §7.13: public pages are server-rendered from public endpoints, and removed content
 * must disappear within PUBLIC_CACHE_MAX_MINUTES. Public GETs are shared-cacheable for at most
 * that long; anything personalised or authenticated is never stored by shared caches.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private appConfig: AppConfig,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    if (req.method === 'GET' && isPublic && !cookies[ACCESS_COOKIE]) {
      const seconds = this.appConfig.publicCacheMaxMinutes * 60;
      res.setHeader(
        'Cache-Control',
        `public, max-age=60, s-maxage=${seconds}, stale-while-revalidate=60`,
      );
    } else {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    return next.handle();
  }
}
