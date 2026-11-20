import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ELIGIBLE_REVIEW_WHERE,
  ratingSummary,
  roundRating,
} from '../common/rating-rules';

type Db = Prisma.TransactionClient | PrismaService;

export type Distribution = Record<'1' | '2' | '3' | '4' | '5', number>;

/**
 * The only place ratings are calculated (PRD §7.12, acceptance criterion 13).
 * Every write that can change eligibility calls recompute() in the same transaction, and the
 * values are always derived from the review rows — never incremented — so they cannot drift.
 */
@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  async recompute(businessId: string, db: Db = this.prisma) {
    const where = { businessId, ...ELIGIBLE_REVIEW_WHERE };
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

  /** Average and count per dimension, over eligible reviews (PRD §7.12 "dimension ratings"). */
  async dimensionBreakdown(businessId: string, categoryId: string) {
    const [configured, stats] = await Promise.all([
      this.prisma.categoryDimension.findMany({
        where: { categoryId, dimension: { isActive: true } },
        orderBy: { sortOrder: 'asc' },
        include: { dimension: true },
      }),
      this.prisma.reviewDimension.groupBy({
        by: ['dimensionId'],
        where: { review: { businessId, ...ELIGIBLE_REVIEW_WHERE } },
        _avg: { score: true },
        _count: { _all: true },
      }),
    ]);
    const byId = new Map(stats.map((s) => [s.dimensionId, s]));
    return configured.map(({ dimension }) => {
      const s = byId.get(dimension.id);
      const count = s?._count._all ?? 0;
      const summary = ratingSummary(count, s?._avg.score ?? null);
      return {
        key: dimension.key,
        name: dimension.name,
        reviewCount: count,
        average: summary.average,
        sufficientData: summary.sufficientData,
      };
    });
  }

  /** Public rating block for a business row. */
  summary(business: {
    reviewCount: number;
    ratingAverage: number | null;
    ratingDistribution: Prisma.JsonValue;
  }) {
    const distribution = (business.ratingDistribution ?? {}) as Distribution;
    const total = business.reviewCount;
    return {
      ...ratingSummary(total, business.ratingAverage),
      distribution: (['5', '4', '3', '2', '1'] as const).map((stars) => ({
        stars: Number(stars),
        count: distribution[stars] ?? 0,
        percent: total
          ? Math.round(((distribution[stars] ?? 0) / total) * 100)
          : 0,
      })),
    };
  }

  /** Compact rating for search results and lists. */
  compact(business: { reviewCount: number; ratingAverage: number | null }) {
    const s = ratingSummary(business.reviewCount, business.ratingAverage);
    return {
      reviewCount: s.reviewCount,
      average: s.average,
      sufficientData: s.sufficientData,
      message: s.message,
    };
  }

  round = roundRating;
}
