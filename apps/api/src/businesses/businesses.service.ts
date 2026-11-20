import { Injectable, NotFoundException } from '@nestjs/common';
import { BusinessStatus, Prisma, VoteValue } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MIN_REVIEWS_FOR_RATING,
  PUBLIC_REVIEW_STATUSES,
} from '../common/rating-rules';
import { normalizeState, stateName } from '../common/nigeria';
import { normalizeNigerianPhone } from '../common/identifiers';
import { pageMeta, skipTake } from '../common/pagination';
import { RatingsService } from './ratings.service';
import { lifecycleStage, ownershipBadge } from './lifecycle';
import type {
  ReviewListQueryDto,
  SearchBusinessesQueryDto,
} from './businesses.dto';
import {
  PUBLIC_REVIEW_INCLUDE,
  presentReview,
} from '../reviews/review-presenter';

const CARD_INCLUDE = {
  category: { select: { slug: true, name: true } },
  locations: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
} satisfies Prisma.BusinessInclude;

type CardRow = Prisma.BusinessGetPayload<{ include: typeof CARD_INCLUDE }>;

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

@Injectable()
export class BusinessesService {
  constructor(
    private prisma: PrismaService,
    private ratings: RatingsService,
  ) {}

  presentLocation(l: CardRow['locations'][number]) {
    return {
      type: l.type.toLowerCase(),
      addressLine: l.addressLine,
      area: l.area,
      city: l.city,
      state: l.state,
      stateName: stateName(l.state),
      nationwide: l.nationwide,
      isPrimary: l.isPrimary,
    };
  }

  /** Search-result card (PRD §7.2: name, category, location, review count, rating where available). */
  presentCard(b: CardRow) {
    const primary = b.locations[0];
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      logoUrl: b.logoUrl,
      category: b.category,
      location: primary
        ? {
            area: primary.area,
            city: primary.city,
            state: primary.state,
            stateName: stateName(primary.state),
            nationwide: primary.nationwide,
          }
        : null,
      rating: this.ratings.compact(b),
      ownership: ownershipBadge(b.ownershipStatus),
      underInvestigation: b.underInvestigation,
    };
  }

  /**
   * Full-text + partial-match search over names, alternative names, handles, websites,
   * phones, CAC numbers, category and location (PRD §7.2, §13 "PostgreSQL full-text search").
   * All user input reaches SQL as bound parameters.
   */
  async search(query: SearchBusinessesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const q = (query.q ?? '').trim().slice(0, 100);
    const tsq = q ? toPrefixTsQuery(q) : null;
    // A phone typed any common way ("0803 123 4567") matches the stored +234 form.
    const phone = q ? normalizeNigerianPhone(q) : null;
    const like = q
      ? `%${escapeLike(phone ?? q.toLowerCase().replace(/^@/, ''))}%`
      : null;

    const conditions: Prisma.Sql[] = [Prisma.sql`b.status = 'PUBLISHED'`];
    if (q) {
      conditions.push(Prisma.sql`(
        ${tsq ? Prisma.sql`b."searchVector" @@ to_tsquery('simple', ${tsq}) OR` : Prisma.empty}
        b."searchText" ILIKE ${like}
        OR word_similarity(${q.toLowerCase()}, b."searchText") > 0.5
      )`);
    }
    if (query.category) {
      conditions.push(Prisma.sql`c.slug = ${query.category.toLowerCase()}`);
    }
    const state = query.state ? normalizeState(query.state) : null;
    if (query.state && !state) {
      return { data: [], meta: pageMeta(page, limit, 0) };
    }
    if (state || query.city) {
      const cityLike = query.city
        ? `%${escapeLike(query.city.toLowerCase())}%`
        : null;
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "BusinessLocation" l WHERE l."businessId" = b.id
        ${state ? Prisma.sql`AND (l.state = ${state} OR l.nationwide)` : Prisma.empty}
        ${cityLike ? Prisma.sql`AND (lower(coalesce(l.city,'')) LIKE ${cityLike} OR lower(coalesce(l.area,'')) LIKE ${cityLike})` : Prisma.empty}
      )`);
    }
    if (query.minRating) {
      // PRD §7.2: rating filter only where sufficient review data exists.
      conditions.push(
        Prisma.sql`b."reviewCount" >= ${MIN_REVIEWS_FOR_RATING} AND b."ratingAverage" >= ${query.minRating}`,
      );
    }
    const where = Prisma.join(conditions, ' AND ');

    // Never let this collapse to a bare integer: in ORDER BY Postgres reads "0" as a column position.
    const relevance = q
      ? Prisma.sql`(
          ${tsq ? Prisma.sql`ts_rank(b."searchVector", to_tsquery('simple', ${tsq})) * 2 +` : Prisma.empty}
          similarity(lower(b.name), ${q.toLowerCase()}) * 3 +
          word_similarity(${q.toLowerCase()}, b."searchText")
        )`
      : null;
    const sufficient = Prisma.sql`(b."reviewCount" >= ${MIN_REVIEWS_FOR_RATING})`;
    const orderBy =
      query.sort === 'most_reviewed'
        ? relevance
          ? Prisma.sql`b."reviewCount" DESC, ${relevance} DESC, b.name ASC`
          : Prisma.sql`b."reviewCount" DESC, b.name ASC`
        : query.sort === 'rating'
          ? Prisma.sql`${sufficient} DESC, b."ratingAverage" DESC NULLS LAST, b."reviewCount" DESC, b.name ASC`
          : relevance
            ? Prisma.sql`${relevance} DESC, b."reviewCount" DESC, b.name ASC`
            : Prisma.sql`b."reviewCount" DESC, b."publishedAt" DESC NULLS LAST, b.name ASC`;

    const { skip, take } = skipTake(page, limit);
    const [ids, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT b.id FROM "Business" b
        JOIN "BusinessCategory" c ON c.id = b."categoryId"
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "Business" b
        JOIN "BusinessCategory" c ON c.id = b."categoryId"
        WHERE ${where}`,
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
   * Public profile (PRD §7.3, §7.12). A merged listing answers with where it moved to
   * so old links keep working.
   */
  async profile(slug: string) {
    const b = await this.prisma.business.findUnique({
      where: { slug },
      include: {
        ...CARD_INCLUDE,
        identifiers: {
          where: { isPublic: true },
          orderBy: { createdAt: 'asc' },
        },
        mergedInto: { select: { slug: true, name: true } },
        _count: {
          select: {
            responses: { where: { status: 'PUBLISHED' } },
          },
        },
      },
    });
    if (!b) throw new NotFoundException('Business not found');
    if (b.status === BusinessStatus.MERGED && b.mergedInto) {
      return {
        data: {
          merged: true,
          mergedInto: b.mergedInto,
          message: `This listing was merged into ${b.mergedInto.name}.`,
        },
      };
    }
    if (b.status !== BusinessStatus.PUBLISHED) {
      throw new NotFoundException('Business not found');
    }

    const [dimensions, recent] = await Promise.all([
      this.ratings.dimensionBreakdown(b.id, b.categoryId),
      this.prisma.review.findMany({
        where: { businessId: b.id, status: { in: PUBLIC_REVIEW_STATUSES } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: PUBLIC_REVIEW_INCLUDE,
      }),
    ]);

    const social = b.identifiers.filter((i) =>
      ['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'X', 'WHATSAPP'].includes(i.type),
    );
    return {
      data: {
        id: b.id,
        slug: b.slug,
        name: b.name,
        description: b.description,
        logoUrl: b.logoUrl,
        category: b.category,
        website: b.website,
        publicContact: { email: b.publicEmail, phone: b.publicPhone },
        socialLinks: social.map((i) => ({
          type: i.type.toLowerCase(),
          handle: i.normalizedValue,
          value: i.value,
        })),
        alternativeNames: b.identifiers
          .filter((i) => i.type === 'ALTERNATIVE_NAME')
          .map((i) => i.value),
        locations: b.locations.map((l) => this.presentLocation(l)),
        rating: { ...this.ratings.summary(b), dimensions },
        ownership: ownershipBadge(b.ownershipStatus),
        lifecycleStage: lifecycleStage(b),
        underInvestigation: b.underInvestigation
          ? {
              label: 'Under investigation',
              note:
                b.investigationNote ??
                'TalkGround is reviewing activity on this profile.',
            }
          : null,
        responseCount: b._count.responses,
        recentReviews: recent.map((r) => presentReview(r)),
        disclaimer:
          'A listing on TalkGround is not an endorsement. Ratings come only from customer reviews.',
        publishedAt: b.publishedAt,
      },
    };
  }

  async reviews(slug: string, query: ReviewListQueryDto, viewerId?: string) {
    const b = await this.prisma.business.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!b || b.status !== BusinessStatus.PUBLISHED) {
      throw new NotFoundException('Business not found');
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ReviewWhereInput = {
      businessId: b.id,
      status: { in: PUBLIC_REVIEW_STATUSES },
      ...(query.stars ? { overallRating: query.stars } : {}),
    };
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
    const votes = viewerId
      ? await this.prisma.helpfulVote.findMany({
          where: { userId: viewerId, reviewId: { in: rows.map((r) => r.id) } },
          select: { reviewId: true, value: true },
        })
      : [];
    const voteBy = new Map<string, VoteValue>(
      votes.map((v) => [v.reviewId, v.value]),
    );
    return {
      data: rows.map((r) =>
        presentReview(r, { myVote: voteBy.get(r.id) ?? null }),
      ),
      meta: pageMeta(page, limit, total),
    };
  }
}
