import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../common/app-config';
import { RATED_REVIEW_WHERE, ratingSummary } from '../common/rating-rules';
import type {
  DimensionAverageDto,
  RatingCompactDto,
  RatingSummaryDto,
} from './businesses.responses';

type Db = Prisma.TransactionClient | PrismaService;

export type Distribution = Record<'1' | '2' | '3' | '4' | '5', number>;

/**
 * The only place ratings are calculated (PRD v2.5 §7.12). Every write that can change which
 * reviews are PUBLISHED calls recompute() in the same transaction; values are always derived
 * from the review rows, never incremented, so they cannot drift.
 */
@Injectable()
export class RatingsService {
  constructor(
    private prisma: PrismaService,
    private appConfig: AppConfig,
  ) {}

  get minReviews() {
    return this.appConfig.minReviewsForRating;
  }

  async recompute(businessId: string, db: Db = this.prisma) {
    const where = { businessId, ...RATED_REVIEW_WHERE };
    const [agg, groups] = await Promise.all([
      db.review.aggregate({
        where,
        _count: { _all: true },
        _avg: { overallRating: true },
      }),
      db.review.groupBy({
        by: ['overallRating'],
        where,
        _count: { _all: true },
      }),
    ]);
    const distribution: Distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of groups) {
      distribution[String(g.overallRating) as keyof Distribution] =
        g._count._all;
    }
    await db.business.update({
      where: { id: businessId },
      data: {
        reviewCount: agg._count._all,
        ratingAverage: agg._avg.overallRating ?? null,
        ratingDistribution: distribution,
      },
    });
    return { reviewCount: agg._count._all, average: agg._avg.overallRating };
  }

  /** Average per dimension, over published reviews that rated it (§7.12). */
  async dimensionBreakdown(
    businessId: string,
    categoryId: string,
  ): Promise<DimensionAverageDto[]> {
    const [configured, stats] = await Promise.all([
      this.prisma.categoryDimension.findMany({
        where: { categoryId, dimension: { active: true } },
        orderBy: { order: 'asc' },
        include: { dimension: true },
      }),
      this.prisma.reviewDimensionRating.groupBy({
        by: ['dimensionId'],
        where: { review: { businessId, ...RATED_REVIEW_WHERE } },
        _avg: { value: true },
        _count: { _all: true },
      }),
    ]);
    const byId = new Map(stats.map((s) => [s.dimensionId, s]));
    return configured.map(({ dimension }) => {
      const s = byId.get(dimension.id);
      const summary = ratingSummary(
        s?._count._all ?? 0,
        s?._avg.value ?? null,
        this.minReviews,
      );
      return {
        key: dimension.key,
        label: dimension.label,
        reviewCount: summary.reviewCount,
        average: summary.average,
        sufficientData: summary.sufficientData,
      };
    });
  }

  /** Full rating block: summary + distribution (counts for 1 to 5 are always exposed). */
  summary(business: {
    reviewCount: number;
    ratingAverage: number | null;
    ratingDistribution: Prisma.JsonValue;
  }): Omit<RatingSummaryDto, 'dimensions'> {
    const distribution = (business.ratingDistribution ?? {}) as Distribution;
    const total = business.reviewCount;
    return {
      ...ratingSummary(total, business.ratingAverage, this.minReviews),
      distribution: (['5', '4', '3', '2', '1'] as const).map((stars) => ({
        stars: Number(stars),
        count: distribution[stars] ?? 0,
        percent: total
          ? Math.round(((distribution[stars] ?? 0) / total) * 100)
          : 0,
      })),
    };
  }

  compact(business: {
    reviewCount: number;
    ratingAverage: number | null;
  }): RatingCompactDto {
    const s = ratingSummary(
      business.reviewCount,
      business.ratingAverage,
      this.minReviews,
    );
    return {
      reviewCount: s.reviewCount,
      average: s.average,
      sufficientData: s.sufficientData,
      message: s.message,
    };
  }
}
