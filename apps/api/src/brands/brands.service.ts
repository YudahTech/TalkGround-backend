import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BrandCategory,
  BrandStatus,
  City,
  Prisma,
  ReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BrandQueryDto } from './brands.dto';
import { BRAND_FILTER_OPTIONS } from './brands-filters';
import {
  categoryLabel,
  computeTrustScore,
  ratingDistributionPercentages,
  toApiCategory,
  toApiCity,
} from '../common/utils';

const PUBLIC_REVIEW_STATUSES = [
  ReviewStatus.PUBLISHED,
  ReviewStatus.PENDING_VERIFICATION,
] as const;

export type BrandListFilters = {
  city?: City;
  category?: BrandCategory;
  q?: string;
};

@Injectable()
export class BrandsService {
  constructor(private prisma: PrismaService) {}

  private buildActiveBrandWhere(
    filters: BrandListFilters = {},
  ): Prisma.BrandWhereInput {
    const where: Prisma.BrandWhereInput = { status: BrandStatus.ACTIVE };

    if (filters.city) {
      where.city = filters.city;
    }
    if (filters.category) {
      where.category = filters.category;
    }
    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { area: { contains: filters.q, mode: 'insensitive' } },
        { tags: { hasSome: [filters.q] } },
      ];
    }

    return where;
  }

  private async ratingStats(brandId: string) {
    const reviews = await this.prisma.review.findMany({
      where: {
        brandId,
        status: { in: [...PUBLIC_REVIEW_STATUSES] },
      },
      select: { rating: true, verifiedVisit: true },
    });

    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    let verifiedCount = 0;
    for (const r of reviews) {
      breakdown[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
      sum += r.rating;
      if (r.verifiedVisit) verifiedCount += 1;
    }

    const reviewCount = reviews.length;
    const averageRating = reviewCount
      ? Math.round((sum / reviewCount) * 10) / 10
      : 0;

    return {
      averageRating,
      reviewCount,
      verifiedCount,
      ratingBreakdown: breakdown,
      ratingDistribution: ratingDistributionPercentages(breakdown, reviewCount),
    };
  }

  private mapBrand(
    brand: {
      id: string;
      name: string;
      slug: string;
      logoUrl: string | null;
      category: string;
      subType: string | null;
      tags: string[];
      city: string;
      area: string;
      website: string | null;
      description?: string | null;
      claimed: boolean;
    },
    stats: {
      averageRating: number;
      reviewCount: number;
      verifiedCount: number;
      ratingBreakdown?: object;
      ratingDistribution?: object;
    },
    extra?: Record<string, unknown>,
  ) {
    const trust = computeTrustScore({
      averageRating: stats.averageRating,
      reviewCount: stats.reviewCount,
      verifiedCount: stats.verifiedCount,
      claimed: brand.claimed,
    });

    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      category: toApiCategory(brand.category),
      categoryLabel: categoryLabel(brand.category),
      subType: brand.subType?.toLowerCase(),
      tags: brand.tags,
      city: toApiCity(brand.city),
      area: brand.area,
      location: `${brand.area}, ${toApiCity(brand.city) === 'lagos' ? 'Lagos' : 'Abuja'}, Nigeria`,
      website: brand.website,
      description: brand.description,
      claimed: brand.claimed,
      trustScore: trust.score,
      trustLabel: trust.label,
      averageRating: stats.averageRating,
      reviewCount: stats.reviewCount,
      ratingBreakdown: stats.ratingBreakdown,
      ratingDistribution: stats.ratingDistribution,
      ...extra,
    };
  }

  async findAll(query: BrandQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 9;
    const skip = (page - 1) * limit;

    const where: Prisma.BrandWhereInput = {
      status: BrandStatus.ACTIVE,
    };

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { area: { contains: query.q, mode: 'insensitive' } },
        { tags: { hasSome: [query.q] } },
      ];
    }
    if (query.city) {
      where.city = query.city.toUpperCase() as 'LAGOS' | 'ABUJA';
    }
    if (query.category) {
      where.category = query.category.toUpperCase() as 'RESTAURANTS' | 'HOTELS';
    }

    const total = await this.prisma.brand.count({ where });
    const brands = await this.prisma.brand.findMany({
      where,
      skip,
      take: limit,
      orderBy:
        query.sort === 'newest'
          ? { createdAt: 'desc' }
          : { createdAt: 'desc' },
    });

    const data = await Promise.all(
      brands.map(async (brand) => {
        const stats = await this.ratingStats(brand.id);
        if (query.minRating && stats.averageRating < query.minRating) {
          return null;
        }
        return this.mapBrand(brand, stats);
      }),
    );

    const filtered = data.filter(Boolean) as ReturnType<typeof this.mapBrand>[];
    const sorted = [...filtered].sort((a, b) => {
      if (query.sort === 'review_count' || query.sort === 'most_reviewed') {
        return b.reviewCount - a.reviewCount;
      }
      if (query.sort === 'newest') return 0;
      return b.averageRating - a.averageRating;
    });

    return {
      data: sorted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        showing: sorted.length,
        query: query.q ?? 'All Brands',
      },
    };
  }

  async findBySlug(slug: string) {
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand || brand.status !== BrandStatus.ACTIVE) {
      throw new NotFoundException('Brand not found');
    }

    const stats = await this.ratingStats(brand.id);

    return {
      data: this.mapBrand(brand, stats),
    };
  }

  async listForHomeSector(filters: BrandListFilters, limit = 4) {
    const brands = await this.prisma.brand.findMany({
      where: this.buildActiveBrandWhere(filters),
      take: Math.min(limit * 3, 50),
      orderBy: { createdAt: 'desc' },
    });

    const mapped = await Promise.all(
      brands.map(async (brand) => {
        const stats = await this.ratingStats(brand.id);
        return this.mapBrand(brand, stats);
      }),
    );

    return mapped
      .sort((a, b) => b.reviewCount - a.reviewCount || b.averageRating - a.averageRating)
      .slice(0, limit);
  }

  async getTopRatedThisWeek(filters: BrandListFilters, limit = 5) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const weeklyReviews = await this.prisma.review.findMany({
      where: {
        createdAt: { gte: weekAgo },
        status: { in: [...PUBLIC_REVIEW_STATUSES] },
        brand: this.buildActiveBrandWhere(filters),
      },
      select: {
        brandId: true,
        rating: true,
      },
    });

    const weeklyByBrand = new Map<
      string,
      { totalRating: number; reviewsThisWeek: number }
    >();
    for (const review of weeklyReviews) {
      const current = weeklyByBrand.get(review.brandId) ?? {
        totalRating: 0,
        reviewsThisWeek: 0,
      };
      current.totalRating += review.rating;
      current.reviewsThisWeek += 1;
      weeklyByBrand.set(review.brandId, current);
    }

    const weeklyRanked = [...weeklyByBrand.entries()]
      .map(([brandId, stats]) => ({
        brandId,
        reviewsThisWeek: stats.reviewsThisWeek,
        averageRatingThisWeek:
          Math.round((stats.totalRating / stats.reviewsThisWeek) * 10) / 10,
      }))
      .sort(
        (a, b) =>
          b.averageRatingThisWeek - a.averageRatingThisWeek ||
          b.reviewsThisWeek - a.reviewsThisWeek,
      );

    const selectedIds = weeklyRanked.slice(0, limit).map((row) => row.brandId);
    const weeklyMeta = new Map(
      weeklyRanked.map((row) => [row.brandId, row]),
    );

    if (selectedIds.length < limit) {
      const backfill = await this.prisma.brand.findMany({
        where: {
          ...this.buildActiveBrandWhere(filters),
          id: selectedIds.length ? { notIn: selectedIds } : undefined,
        },
        take: 30,
        orderBy: { createdAt: 'desc' },
      });

      const backfillRanked = await Promise.all(
        backfill.map(async (brand) => {
          const stats = await this.ratingStats(brand.id);
          return { brand, stats };
        }),
      );

      backfillRanked.sort(
        (a, b) =>
          b.stats.averageRating - a.stats.averageRating ||
          b.stats.reviewCount - a.stats.reviewCount,
      );

      for (const { brand } of backfillRanked) {
        if (selectedIds.length >= limit) break;
        if (!selectedIds.includes(brand.id)) {
          selectedIds.push(brand.id);
        }
      }
    }

    const brands = await this.prisma.brand.findMany({
      where: { id: { in: selectedIds } },
    });
    const brandById = new Map(brands.map((brand) => [brand.id, brand]));

    const results = await Promise.all(
      selectedIds.map(async (brandId) => {
        const brand = brandById.get(brandId);
        if (!brand) return null;

        const stats = await this.ratingStats(brand.id);
        const weekly = weeklyMeta.get(brandId);

        return {
          ...this.mapBrand(brand, stats),
          averageRatingThisWeek: weekly?.averageRatingThisWeek ?? stats.averageRating,
          reviewsThisWeek: weekly?.reviewsThisWeek ?? 0,
        };
      }),
    );

    return results
      .filter(Boolean)
      .map((brand, index) => ({
        rank: index + 1,
        ...(brand as NonNullable<(typeof results)[number]>),
      }));
  }

  async getFilterOptions() {
    const activeWhere = { status: BrandStatus.ACTIVE };

    const [total, restaurants, hotels, lagos, abuja] = await Promise.all([
      this.prisma.brand.count({ where: activeWhere }),
      this.prisma.brand.count({
        where: { ...activeWhere, category: BrandCategory.RESTAURANTS },
      }),
      this.prisma.brand.count({
        where: { ...activeWhere, category: BrandCategory.HOTELS },
      }),
      this.prisma.brand.count({ where: { ...activeWhere, city: City.LAGOS } }),
      this.prisma.brand.count({ where: { ...activeWhere, city: City.ABUJA } }),
    ]);

    return {
      categories: BRAND_FILTER_OPTIONS.categories.map((category) => ({
        ...category,
        count:
          category.id === 'all'
            ? total
            : category.id === 'restaurants'
              ? restaurants
              : category.id === 'hotels'
                ? hotels
                : 0,
      })),
      cities: BRAND_FILTER_OPTIONS.cities.map((city) => ({
        ...city,
        count: city.id === 'lagos' ? lagos : city.id === 'abuja' ? abuja : 0,
      })),
      ratingFilters: BRAND_FILTER_OPTIONS.ratingFilters,
      sortOptions: BRAND_FILTER_OPTIONS.sortOptions,
    };
  }

  async getUserBrandContext(slug: string, userId: string) {
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand || brand.status !== BrandStatus.ACTIVE) {
      throw new NotFoundException('Brand not found');
    }

    const existing = await this.prisma.review.findUnique({
      where: { brandId_userId: { brandId: brand.id, userId } },
    });

    return {
      data: {
        userHasReviewed:
          !!existing && existing.status !== ReviewStatus.REMOVED,
        reviewId: existing?.id ?? null,
      },
    };
  }
}
