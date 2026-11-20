import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { durationToMs, envFlag } from './security';

/** Access tokens may never live longer than this (PRD v2.5 §7.1). */
export const MAX_ACCESS_TOKEN_MS = 15 * 60 * 1000;

/**
 * Every PRD v2.5 configuration flag in one place ("Config flags" table). Values come from the
 * environment with the PRD defaults; nothing here is hardcoded elsewhere in the code.
 */
@Injectable()
export class AppConfig {
  private readonly logger = new Logger(AppConfig.name);

  constructor(private config: ConfigService) {}

  private int(key: string, fallback: number, min = 0): number {
    const raw = this.config.get<string>(key);
    const n = raw === undefined || raw === '' ? fallback : Number(raw);
    return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
  }

  /** §7.1 REQUIRE_PHONE_VERIFIED_FOR_REVIEWS (default false). */
  get requirePhoneVerifiedForReviews(): boolean {
    return envFlag(
      this.config.get('REQUIRE_PHONE_VERIFIED_FOR_REVIEWS'),
      false,
    );
  }

  /** §7.1 Email verification is required to post a review. */
  get requireEmailVerified(): boolean {
    return envFlag(this.config.get('REVIEW_REQUIRE_EMAIL_VERIFIED'), true);
  }

  /** §7.1 Access token lifetime, capped at 15 minutes. */
  get accessTokenMs(): number {
    const wanted = durationToMs(
      this.config.get<string>('JWT_EXPIRES_IN', '15m'),
    );
    if (wanted > MAX_ACCESS_TOKEN_MS) {
      this.logger.warn(
        'JWT_EXPIRES_IN is above 15 minutes; capped at 15m (PRD §7.1).',
      );
      return MAX_ACCESS_TOKEN_MS;
    }
    return wanted;
  }

  /** §7.12 MIN_REVIEWS_FOR_RATING (default 3). */
  get minReviewsForRating(): number {
    return this.int('MIN_REVIEWS_FOR_RATING', 3, 1);
  }

  /** §7.6 New reviews per user per 24 hours (default 3). */
  get reviewDailyLimit(): number {
    return this.int('REVIEW_DAILY_LIMIT', 3, 1);
  }

  /** §7.6 Review body minimum length (default 50). */
  get reviewBodyMinLength(): number {
    return this.int('REVIEW_BODY_MIN_LENGTH', 50, 1);
  }

  /** §7.13 INDEXABLE_MIN_DESCRIPTION_CHARS (default 80). */
  get indexableMinDescriptionChars(): number {
    return this.int('INDEXABLE_MIN_DESCRIPTION_CHARS', 80);
  }

  /** §7.13 INDEXABLE_MIN_REVIEWS (default 0). */
  get indexableMinReviews(): number {
    return this.int('INDEXABLE_MIN_REVIEWS', 0);
  }

  /** §7.13 INDEXABLE_MIN_LISTINGS (default 5). */
  get indexableMinListings(): number {
    return this.int('INDEXABLE_MIN_LISTINGS', 5, 1);
  }

  /** §7.13 PUBLIC_CACHE_MAX_MINUTES (default 15). */
  get publicCacheMaxMinutes(): number {
    return this.int('PUBLIC_CACHE_MAX_MINUTES', 15, 1);
  }

  /** Public site origin used for canonical URLs, share links and emails. */
  get frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') ??
      (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000').split(
        ',',
      )[0]
    )
      .trim()
      .replace(/\/$/, '');
  }

  /** Values the frontend needs to behave consistently with the API. */
  publicValues() {
    return {
      minReviewsForRating: this.minReviewsForRating,
      reviewBodyMinLength: this.reviewBodyMinLength,
      reviewTitleMinLength: 3,
      reviewTitleMaxLength: 120,
      reviewDailyLimit: this.reviewDailyLimit,
      requirePhoneVerifiedForReviews: this.requirePhoneVerifiedForReviews,
      indexableMinDescriptionChars: this.indexableMinDescriptionChars,
      indexableMinReviews: this.indexableMinReviews,
      indexableMinListings: this.indexableMinListings,
      publicCacheMaxMinutes: this.publicCacheMaxMinutes,
      accessTokenSeconds: Math.floor(this.accessTokenMs / 1000),
    };
  }
}

@Global()
@Module({ providers: [AppConfig], exports: [AppConfig] })
export class AppConfigModule {}
