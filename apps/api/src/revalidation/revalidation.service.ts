import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * On-demand revalidation (PRD v2.5 §7.13: preferred over waiting for the cache to expire).
 * When public content changes, POST the affected page paths to the frontend:
 *
 *   POST FRONTEND_REVALIDATE_URL
 *   X-TalkGround-Signature: sha256=<hex HMAC of the raw body with REVALIDATE_SECRET>
 *   { "paths": ["/b/mama-put-kitchen", "/c/food-and-restaurants"] }
 *
 * Fire-and-forget: a failure never affects the API action. Without configuration it is a no-op,
 * and the Cache-Control bound (PUBLIC_CACHE_MAX_MINUTES) still applies.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  private get endpoint() {
    return this.config.get<string>('FRONTEND_REVALIDATE_URL');
  }

  paths(paths: string[]) {
    const url = this.endpoint;
    const secret = this.config.get<string>('REVALIDATE_SECRET');
    const unique = [...new Set(paths.filter(Boolean))];
    if (!url || !secret || !unique.length) return;
    const body = JSON.stringify({ paths: unique });
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    void fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TalkGround-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => {
        if (!r.ok)
          this.logger.warn(
            `Revalidation returned ${r.status} for ${unique.join(', ')}`,
          );
      })
      .catch((err) =>
        this.logger.warn(`Revalidation failed: ${(err as Error).message}`),
      );
  }

  /** Business page + its category and category-in-city pages. */
  async business(businessId: string) {
    if (!this.endpoint) return;
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        slug: true,
        category: { select: { slug: true } },
        city: { select: { slug: true } },
      },
    });
    if (!b) return;
    this.paths([
      `/b/${b.slug}`,
      `/c/${b.category.slug}`,
      ...(b.city ? [`/c/${b.category.slug}/${b.city.slug}`] : []),
    ]);
  }

  async businesses(ids: string[]) {
    for (const id of new Set(ids)) await this.business(id);
  }
}

@Global()
@Module({ providers: [RevalidationService], exports: [RevalidationService] })
export class RevalidationModule {}
