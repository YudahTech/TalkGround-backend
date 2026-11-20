import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VISIBLE_REVIEW_WHERE } from '../common/rating-rules';
import { pageMeta, skipTake } from '../common/pagination';
import { normalizeNigerianPhone } from '../common/identifiers';
import { RatingsService } from './ratings.service';
import { SeoService } from './seo.service';
import { LISTING_DISCLAIMER, ownershipBadge } from './lifecycle';
import type {
  ReviewListQueryDto,
  SearchBusinessesQueryDto,
} from './businesses.dto';
import type {
  BusinessCardDto,
  BusinessLocationDto,
  BusinessNoticeDto,
  BusinessProfileDto,
  BusinessRedirectDto,
  CategoryPageDto,
} from './businesses.responses';
import {
  PUBLIC_REVIEW_INCLUDE,
  presentReview,
} from '../reviews/review-presenter';

export const CARD_INCLUDE = {
  category: { select: { slug: true, name: true } },
  city: { select: { slug: true, name: true, state: true } },
} satisfies Prisma.BusinessInclude;

type CardRow = Prisma.BusinessGetPayload<{ include: typeof CARD_INCLUDE }>;

const RECENT_REVIEWS_ON_PROFILE = 10;

/** Turn free text into a safe prefix tsquery: "kemi clos" → "kemi:* & clos:*". */
function toPrefixTsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(' & ') : null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function presentLocation(b: {
  city: { slug: string; name: string; state: string } | null;
  area: string | null;
  onlineOnly: boolean;
}): BusinessLocationDto {
  const label =
    b.onlineOnly && !b.city
      ? 'Online only'
      : [b.area, b.city?.name].filter(Boolean).join(', ') ||
        (b.onlineOnly ? 'Online only' : '');
  return { city: b.city, area: b.area, onlineOnly: b.onlineOnly, label };
}

@Injectable()
export class BusinessesService {
  constructor(
    private prisma: PrismaService,
    private ratings: RatingsService,
    private seo: SeoService,
  ) {}

  /** Search-result card (PRD §7.2: name, category, location, review count, rating or insufficient-data). */
  presentCard(b: CardRow): BusinessCardDto {
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      logoUrl: b.logoUrl,
      category: b.category,
      location: presentLocation(b),
      rating: this.ratings.compact(b),
      ownership: ownershipBadge(b.ownershipStatus, b.ownershipVerified),
      path: `/b/${b.slug}`,
    };
  }

  /**
   * Full-text + partial matching over name, alternative names, handles, website, category, city
   * and area; exact matching for phone numbers through the identifier table (PRD §7.2). Merged
   * listings are excluded so duplicates never appear twice. All input is bound, never interpolated.
   * Ownership and verification never influence the order (§7.12).
   */
  async search(query: SearchBusinessesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const q = (query.q ?? '').trim().slice(0, 100);
    const phone = q ? normalizeNigerianPhone(q) : null;
    const tsq = q && !phone ? toPrefixTsQuery(q) : null;
    const like =
      q && !phone ? `%${escapeLike(q.toLowerCase().replace(/^@/, ''))}%` : null;
    const lower = q.toLowerCase();

    const conditions: Prisma.Sql[] = [Prisma.sql`b.status = 'PUBLISHED'`];
    if (phone) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "BusinessIdentifier" i
        WHERE i."businessId" = b.id AND i.type = 'PHONE' AND i."normalizedValue" = ${phone})`);
    } else if (q) {
      conditions.push(Prisma.sql`(
        ${tsq ? Prisma.sql`b."searchVector" @@ to_tsquery('simple', ${tsq}) OR` : Prisma.empty}
        b."searchText" ILIKE ${like}
        OR word_similarity(${lower}, b."searchText") > 0.5
      )`);
    }
    if (query.category) conditions.push(Prisma.sql`c.slug = ${query.category}`);
    if (query.city) conditions.push(Prisma.sql`ci.slug = ${query.city}`);
    const min = this.ratings.minReviews;
    if (query.minRating) {
      // §7.2: rating filter only for businesses with enough reviews.
      conditions.push(
        Prisma.sql`b."reviewCount" >= ${min} AND b."ratingAverage" >= ${query.minRating}`,
      );
    }
    const where = Prisma.join(conditions, ' AND ');

    // Never collapse to a bare integer: in ORDER BY Postgres reads "0" as a column position.
    const relevance =
      q && !phone
        ? Prisma.sql`(
            ${tsq ? Prisma.sql`ts_rank(b."searchVector", to_tsquery('simple', ${tsq})) * 2 +` : Prisma.empty}
            similarity(lower(b.name), ${lower}) * 3 +
            word_similarity(${lower}, b."searchText")
          )`
        : null;
    const sufficient = Prisma.sql`(b."reviewCount" >= ${min})`;
    const orderBy =
      query.sort === 'most_reviewed'
        ? Prisma.sql`b."reviewCount" DESC, b.name ASC`
        : query.sort === 'rating'
          ? Prisma.sql`${sufficient} DESC, b."ratingAverage" DESC NULLS LAST, b."reviewCount" DESC, b.name ASC`
          : relevance
            ? Prisma.sql`${relevance} DESC, b."reviewCount" DESC, b.name ASC`
            : Prisma.sql`b."reviewCount" DESC, b.name ASC`;

    const { skip, take } = skipTake(page, limit);
    const from = Prisma.sql`FROM "Business" b
      JOIN "Category" c ON c.id = b."categoryId"
      LEFT JOIN "City" ci ON ci.id = b."cityId"`;
    const [ids, countRows] = await Promise.all([
      this.prisma.$queryRaw<
        { id: string }[]
      >`SELECT b.id ${from} WHERE ${where} ORDER BY ${orderBy} LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*)::bigint AS count ${from} WHERE ${where}`,
    ]);
    const rows = await this.prisma.business.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: CARD_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      data: ids.map((r) => this.presentCard(byId.get(r.id)!)),
      meta: pageMeta(page, limit, Number(countRows[0]?.count ?? 0)),
    };
  }

  /**
   * Public profile, server-render ready (PRD §7.3, §7.13). Returns one of:
   * - kind "profile": the page, with SEO (robots, canonical, title, description, Open Graph, JSON-LD)
   * - kind "redirect": old slug or merged listing → 301 to the current slug
   * - kind "suspended": notice page, noindex
   * Archived → 410. Suggested / pending / rejected → 404.
   */
  async profile(slug: string): Promise<{
    data: BusinessProfileDto | BusinessRedirectDto | BusinessNoticeDto;
  }> {
    const b = await this.prisma.business.findUnique({
      where: { slug },
      include: {
        ...CARD_INCLUDE,
        identifiers: { orderBy: { createdAt: 'asc' } },
        mergedInto: { select: { slug: true, status: true } },
        _count: { select: { responses: { where: { status: 'PUBLISHED' } } } },
      },
    });
    if (!b) {
      const history = await this.prisma.businessSlugHistory.findUnique({
        where: { oldSlug: slug },
        include: { business: { select: { slug: true } } },
      });
      if (history)
        return { data: this.redirect('slug_changed', history.business.slug) };
      throw new NotFoundException('Business not found');
    }
    if (b.status === BusinessStatus.MERGED && b.mergedInto) {
      return { data: this.redirect('merged', b.mergedInto.slug) };
    }
    if (b.status === BusinessStatus.ARCHIVED)
      throw new GoneException('This business is no longer listed');
    if (b.status === BusinessStatus.SUSPENDED) {
      return {
        data: {
          kind: 'suspended',
          slug: b.slug,
          name: b.name,
          notice: 'This business profile is temporarily unavailable.',
          robots: 'noindex,follow',
        },
      };
    }
    if (b.status !== BusinessStatus.PUBLISHED)
      throw new NotFoundException('Business not found');

    const [dimensions, recent] = await Promise.all([
      this.ratings.dimensionBreakdown(b.id, b.categoryId),
      this.prisma.review.findMany({
        where: { businessId: b.id, ...VISIBLE_REVIEW_WHERE },
        orderBy: { createdAt: 'desc' },
        take: RECENT_REVIEWS_ON_PROFILE,
        include: PUBLIC_REVIEW_INCLUDE,
      }),
    ]);
    const rating = { ...this.ratings.summary(b), dimensions };
    const recentReviews = recent.map((r) => presentReview(r));
    const location = presentLocation(b);
    return {
      data: {
        kind: 'profile',
        id: b.id,
        slug: b.slug,
        name: b.name,
        description: b.description,
        logoUrl: b.logoUrl,
        category: b.category,
        location,
        identifiers: b.identifiers.map((i) => ({
          type: i.type.toLowerCase(),
          value: i.value,
          normalizedValue: i.normalizedValue,
          verified: i.verified,
        })),
        publicContact: {
          website: b.website,
          email: b.publicEmail,
          phone: b.publicPhone,
        },
        rating,
        ownership: ownershipBadge(b.ownershipStatus, b.ownershipVerified),
        status: b.status.toLowerCase(),
        responseCount: b._count.responses,
        recentReviews,
        disclaimer: LISTING_DISCLAIMER,
        publishedAt: b.publishedAt,
        seo: this.seo.businessSeo({
          business: { ...b, identifierCount: b.identifiers.length },
          categoryName: b.category.name,
          locationLabel: location.label,
          city: b.city,
          area: b.area,
          rating,
          visibleReviews: recentReviews,
        }),
      },
    };
  }

  private redirect(
    reason: 'slug_changed' | 'merged',
    slug: string,
  ): BusinessRedirectDto {
    return {
      kind: 'redirect',
      reason,
      slug,
      location: `/b/${slug}`,
      statusCode: 301,
    };
  }

  async reviews(slug: string, query: ReviewListQueryDto, viewerId?: string) {
    const b = await this.prisma.business.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!b || b.status !== BusinessStatus.PUBLISHED)
      throw new NotFoundException('Business not found');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ReviewWhereInput = {
      businessId: b.id,
      ...VISIBLE_REVIEW_WHERE,
      ...(query.stars ? { overallRating: query.stars } : {}),
    };
    // §7.9: helpful votes affect review ordering only.
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      query.sort === 'helpful'
        ? [{ helpfulVotes: { _count: 'desc' } }, { createdAt: 'desc' }]
        : query.sort === 'rating_high'
          ? [{ overallRating: 'desc' }, { createdAt: 'desc' }]
          : query.sort === 'rating_low'
            ? [{ overallRating: 'asc' }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy,
        ...skipTake(page, limit),
        include: PUBLIC_REVIEW_INCLUDE,
      }),
      this.prisma.review.count({ where }),
    ]);
    const voted = viewerId
      ? new Set(
          (
            await this.prisma.helpfulVote.findMany({
              where: {
                userId: viewerId,
                reviewId: { in: rows.map((r) => r.id) },
              },
              select: { reviewId: true },
            })
          ).map((v) => v.reviewId),
        )
      : null;
    return {
      data: rows.map((r) =>
        presentReview(r, { helpfulByMe: voted ? voted.has(r.id) : null }),
      ),
      meta: pageMeta(page, limit, total),
    };
  }

  /** Category page and category-in-city page data (PRD §7.13 /c/{category}[/{city}]). */
  async categoryPage(
    categorySlug: string,
    citySlug: string | undefined,
    page: number,
    limit: number,
  ): Promise<{ data: CategoryPageDto; meta: ReturnType<typeof pageMeta> }> {
    const category = await this.prisma.category.findUnique({
      where: { slug: categorySlug },
    });
    if (!category || !category.active)
      throw new NotFoundException('Category not found');
    const city = citySlug
      ? await this.prisma.city.findUnique({ where: { slug: citySlug } })
      : null;
    if (citySlug && (!city || !city.active))
      throw new NotFoundException('City not found');
    const where: Prisma.BusinessWhereInput = {
      status: BusinessStatus.PUBLISHED,
      categoryId: category.id,
      ...(city ? { cityId: city.id } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.business.count({ where }),
      this.prisma.business.findMany({
        where,
        orderBy: [{ reviewCount: 'desc' }, { name: 'asc' }],
        ...skipTake(page, limit),
        include: CARD_INCLUDE,
      }),
    ]);
    return {
      data: {
        category: { slug: category.slug, name: category.name },
        city: city
          ? { slug: city.slug, name: city.name, state: city.state }
          : null,
        total,
        businesses: rows.map((r) => this.presentCard(r)),
        seo: this.seo.categoryPageSeo(category, city, total),
      },
      meta: pageMeta(page, limit, total),
    };
  }
}
