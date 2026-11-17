import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BrandStatus,
  FlagType,
  MediaType,
  ReportStatus,
  ReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddMediaDto,
  CreateReviewDto,
  ReportReviewDto,
  UpdateReviewDto,
} from '../brands/brands.dto';
import { hashIp, hashReviewText, formatRelativeDate } from '../common/utils';
import { envFlag } from '../common/security';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from '../uploads/uploads.service';

/** Statuses visible to the public (and counted in ratings). */
export const PUBLIC_STATUSES: ReviewStatus[] = [
  ReviewStatus.PUBLISHED,
  ReviewStatus.PENDING_VERIFICATION,
];

/** Distinct open reports that hide a review until a moderator decides (PRD §8.4). */
const REPORT_HIDE_THRESHOLD = 3;

type ReviewContent = {
  id: string;
  rating: number;
  title: string;
  body: string;
  pros: string | null;
  cons: string | null;
  recommend: boolean;
};

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private uploads: UploadsService,
  ) {}

  /**
   * Anti-fraud gate (PRD §6.1 / R-2). Each requirement can be relaxed by env for a staged
   * rollout: REVIEW_REQUIRE_EMAIL_VERIFIED / REVIEW_REQUIRE_PHONE_VERIFIED (default true).
   */
  private async ensureCanReview(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { emailVerified: true, phoneVerified: true },
    });
    const missing: string[] = [];
    if (
      envFlag(this.config.get('REVIEW_REQUIRE_EMAIL_VERIFIED'), true) &&
      !user.emailVerified
    ) {
      missing.push('email');
    }
    if (
      envFlag(this.config.get('REVIEW_REQUIRE_PHONE_VERIFIED'), true) &&
      !user.phoneVerified
    ) {
      missing.push('phone');
    }
    if (missing.length) {
      throw new ForbiddenException(
        `Verify your ${missing.join(' and ')} before writing reviews`,
      );
    }
  }

  private mapReview(
    review: {
      id: string;
      rating: number;
      title: string;
      body: string;
      pros: string | null;
      cons: string | null;
      recommend: boolean;
      status: ReviewStatus;
      verifiedVisit: boolean;
      viewCount: number;
      createdAt: Date;
      updatedAt: Date;
      editedAt?: Date | null;
      user: { displayName: string; username: string };
      media?: { id: string; type: MediaType; url: string }[];
      _count?: { helpfulVotes: number };
    },
    options?: { helpfulByMe?: boolean },
  ) {
    return {
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      pros: review.pros,
      cons: review.cons,
      recommend: review.recommend,
      status: review.status.toLowerCase(),
      verifiedVisit: review.verifiedVisit,
      viewCount: review.viewCount,
      helpfulCount: review._count?.helpfulVotes ?? 0,
      helpfulByMe: options?.helpfulByMe ?? false,
      createdAt: review.createdAt,
      relativeDate: formatRelativeDate(review.createdAt),
      updatedAt: review.updatedAt,
      // updatedAt also moves when views are counted, so only editedAt means "the author edited it".
      editedAt: review.editedAt ?? null,
      edited: !!review.editedAt,
      author: {
        displayName: review.user.displayName,
        username: review.user.username,
      },
      photos: (review.media ?? [])
        .filter((m) => m.type === MediaType.PHOTO)
        .map((m) => ({ id: m.id, url: m.url })),
      hasReceipt: (review.media ?? []).some(
        (m) => m.type === MediaType.RECEIPT,
      ),
    };
  }

  async findByBrandSlug(
    slug: string,
    sort = 'recent',
    page = 1,
    limit = 20,
    viewerId?: string,
  ) {
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand) throw new NotFoundException('Brand not found');

    const orderBy =
      sort === 'rating_high'
        ? { rating: 'desc' as const }
        : sort === 'rating_low'
          ? { rating: 'asc' as const }
          : sort === 'helpful'
            ? { helpfulVotes: { _count: 'desc' as const } }
            : sort === 'verified_first'
              ? [
                  { verifiedVisit: 'desc' as const },
                  { createdAt: 'desc' as const },
                ]
              : { createdAt: 'desc' as const };

    const where = {
      brandId: brand.id,
      status: { in: PUBLIC_STATUSES },
    };

    const skip = (page - 1) * limit;
    const [reviews, total, viewerVotes] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: { select: { displayName: true, username: true } },
          media: true,
          _count: { select: { helpfulVotes: true } },
        },
      }),
      this.prisma.review.count({ where }),
      viewerId
        ? this.prisma.reviewHelpfulVote.findMany({
            where: {
              userId: viewerId,
              review: { brandId: brand.id },
            },
            select: { reviewId: true },
          })
        : Promise.resolve([]),
    ]);

    const votedIds = new Set(viewerVotes.map((v) => v.reviewId));

    return {
      data: reviews.map((r) =>
        this.mapReview(r, { helpfulByMe: votedIds.has(r.id) }),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(user: { id: string }, dto: CreateReviewDto, ip?: string) {
    await this.ensureCanReview(user.id);

    const brand = await this.prisma.brand.findUnique({
      where: { id: dto.brandId },
    });
    if (!brand || brand.status !== BrandStatus.ACTIVE) {
      throw new NotFoundException('Brand not found');
    }

    const existing = await this.prisma.review.findUnique({
      where: { brandId_userId: { brandId: dto.brandId, userId: user.id } },
    });
    if (existing && existing.status !== ReviewStatus.REMOVED) {
      throw new ConflictException(
        'You already reviewed this brand. Edit your existing review instead.',
      );
    }

    const recentCount = await this.prisma.review.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recentCount >= 3) {
      throw new BadRequestException('Review limit reached (3 per 24 hours)');
    }

    const salt = this.config.get('JWT_SECRET', 'dev-secret');
    const ipHash = ip ? hashIp(ip, salt) : null;
    const textHash = hashReviewText(dto.body);

    const content = {
      rating: dto.rating,
      title: dto.title,
      body: dto.body,
      pros: dto.pros ?? null,
      cons: dto.cons ?? null,
      recommend: dto.recommend,
      ipHash,
      textHash,
      status: ReviewStatus.PUBLISHED,
    };

    // One row per user+brand (unique constraint). A previously removed review is replaced —
    // its old text is kept as a revision for moderators — instead of failing with a 500.
    const review = existing
      ? await this.prisma.$transaction(async (tx) => {
          await tx.reviewRevision.create({ data: this.snapshot(existing) });
          await tx.reviewMedia.deleteMany({ where: { reviewId: existing.id } });
          return tx.review.update({
            where: { id: existing.id },
            data: {
              ...content,
              verifiedVisit: false,
              editedAt: null,
              createdAt: new Date(),
            },
          });
        })
      : await this.prisma.review.create({
          data: { ...content, brandId: dto.brandId, userId: user.id },
        });

    await this.runTrustChecks(
      review.id,
      user.id,
      dto.brandId,
      ipHash,
      textHash,
      dto.rating,
      false,
    );

    return this.getMapped(review.id);
  }

  private snapshot(review: ReviewContent) {
    return {
      reviewId: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      pros: review.pros,
      cons: review.cons,
      recommend: review.recommend,
    };
  }

  private async getMapped(id: string) {
    const review = await this.prisma.review.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { displayName: true, username: true } },
        media: true,
        _count: { select: { helpfulVotes: true } },
      },
    });
    return { data: this.mapReview(review) };
  }

  async update(
    user: { id: string },
    id: string,
    dto: UpdateReviewDto,
    ip?: string,
  ) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== user.id) throw new ForbiddenException();
    if (
      review.status === ReviewStatus.REMOVED ||
      review.status === ReviewStatus.SUSPENDED
    ) {
      throw new ForbiddenException(
        'This review was removed and can no longer be edited',
      );
    }

    const changed = (Object.keys(dto) as (keyof UpdateReviewDto)[]).some(
      (key) => dto[key] !== undefined && dto[key] !== review[key],
    );
    if (!changed) return this.getMapped(id);

    const textHash = dto.body ? hashReviewText(dto.body) : review.textHash;
    const salt = this.config.get('JWT_SECRET', 'dev-secret');

    // Edit history (PRD R-6): keep the previous version before overwriting.
    await this.prisma.$transaction([
      this.prisma.reviewRevision.create({ data: this.snapshot(review) }),
      this.prisma.review.update({
        where: { id },
        data: {
          ...dto,
          textHash,
          editedAt: new Date(),
          ipHash: ip ? hashIp(ip, salt) : review.ipHash,
        },
      }),
    ]);

    // Edits go through the same trust checks as new reviews (PRD R-7).
    await this.runTrustChecks(
      id,
      user.id,
      review.brandId,
      null,
      textHash ?? '',
      dto.rating ?? review.rating,
      true,
    );

    return this.getMapped(id);
  }

  /** Moderators: every prior version of a review, newest first. */
  async revisions(id: string) {
    const rows = await this.prisma.reviewRevision.findMany({
      where: { reviewId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows };
  }

  async remove(user: { id: string }, id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== user.id) throw new ForbiddenException();

    await this.prisma.review.update({
      where: { id },
      data: { status: ReviewStatus.REMOVED },
    });

    return { data: { message: 'Review removed' } };
  }

  async addMedia(user: { id: string }, id: string, dto: AddMediaDto) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== user.id) throw new ForbiddenException();
    if (
      review.status === ReviewStatus.REMOVED ||
      review.status === ReviewStatus.SUSPENDED
    ) {
      throw new ForbiddenException('This review was removed');
    }

    const type = dto.type === 'receipt' ? MediaType.RECEIPT : MediaType.PHOTO;
    const asset = await this.uploads.verifyAsset(
      dto.url,
      type === MediaType.RECEIPT ? 'receipts' : 'reviews',
    );

    if (type === MediaType.PHOTO) {
      const photoCount = await this.prisma.reviewMedia.count({
        where: { reviewId: id, type: MediaType.PHOTO },
      });
      if (photoCount >= 3) {
        throw new BadRequestException('Maximum 3 photos per review');
      }
    }

    if (type === MediaType.RECEIPT) {
      const existing = await this.prisma.reviewMedia.findFirst({
        where: { reviewId: id, type: MediaType.RECEIPT },
      });
      if (existing) {
        throw new ConflictException('Receipt already uploaded');
      }
      // Only a public review moves to "receipt submitted". A FLAGGED review must stay hidden.
      if (review.status === ReviewStatus.PUBLISHED) {
        await this.prisma.review.update({
          where: { id },
          data: { status: ReviewStatus.PENDING_VERIFICATION },
        });
      }
    }

    const media = await this.prisma.reviewMedia.create({
      data: { reviewId: id, type, url: asset.url },
    });

    // Never echo a private receipt URL back; the client only needs to know it was accepted.
    return {
      data:
        type === MediaType.RECEIPT
          ? { id: media.id, type: media.type, createdAt: media.createdAt }
          : media,
    };
  }

  async report(user: { id: string }, id: string, dto: ReportReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review || !PUBLIC_STATUSES.includes(review.status)) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId === user.id) {
      throw new BadRequestException('You cannot report your own review');
    }

    const alreadyOpen = await this.prisma.reviewReport.findFirst({
      where: { reviewId: id, reporterId: user.id, status: ReportStatus.OPEN },
    });
    if (alreadyOpen) {
      throw new ConflictException('You already reported this review');
    }

    const report = await this.prisma.reviewReport.create({
      data: {
        reviewId: id,
        reporterId: user.id,
        reason: dto.reason,
        note: dto.note,
      },
    });

    const reporters = await this.prisma.reviewReport.findMany({
      where: { reviewId: id, status: ReportStatus.OPEN },
      distinct: ['reporterId'],
      select: { reporterId: true },
    });
    if (reporters.length >= REPORT_HIDE_THRESHOLD) {
      await this.prisma.$transaction([
        this.prisma.review.update({
          where: { id },
          data: { status: ReviewStatus.FLAGGED },
        }),
        this.prisma.reviewFlag.create({
          data: {
            reviewId: id,
            type: FlagType.REPORT_THRESHOLD,
            metadata: { reporters: reporters.length },
          },
        }),
      ]);
    }

    return { data: report };
  }

  async toggleHelpful(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review || !PUBLIC_STATUSES.includes(review.status)) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId === userId) {
      throw new BadRequestException('You cannot vote on your own review');
    }

    const existing = await this.prisma.reviewHelpfulVote.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
    });

    if (existing) {
      await this.prisma.reviewHelpfulVote.delete({
        where: { id: existing.id },
      });
      const count = await this.prisma.reviewHelpfulVote.count({
        where: { reviewId },
      });
      return { data: { helpful: false, helpfulCount: count } };
    }

    await this.prisma.reviewHelpfulVote.create({
      data: { reviewId, userId },
    });
    const count = await this.prisma.reviewHelpfulVote.count({
      where: { reviewId },
    });
    return { data: { helpful: true, helpfulCount: count } };
  }

  async recordView(reviewId: string) {
    const visible = await this.prisma.review.count({
      where: { id: reviewId, status: { in: PUBLIC_STATUSES } },
    });
    if (!visible) throw new NotFoundException('Review not found');

    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: { viewCount: { increment: 1 } },
      select: { id: true, viewCount: true },
    });
    return { data: review };
  }

  private async runTrustChecks(
    reviewId: string,
    userId: string,
    brandId: string,
    ipHash: string | null,
    textHash: string,
    rating: number,
    isEdit: boolean,
  ) {
    const flags: { type: FlagType; metadata?: object }[] = [];

    if (ipHash) {
      const ipMatches = await this.prisma.review.count({
        where: {
          ipHash,
          userId: { not: userId },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      if (ipMatches >= 2) {
        flags.push({ type: FlagType.IP_MATCH, metadata: { count: ipMatches } });
      }
    }

    if (textHash) {
      const dupes = await this.prisma.review.count({
        where: {
          textHash,
          id: { not: reviewId },
        },
      });
      if (dupes > 0) {
        flags.push({
          type: FlagType.DUPLICATE_TEXT,
          metadata: { count: dupes },
        });
      }
    }

    if (!isEdit) {
      const velocity = await this.prisma.review.count({
        where: {
          brandId,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      });
      if (velocity > 5) {
        flags.push({ type: FlagType.VELOCITY, metadata: { count: velocity } });
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      user &&
      rating === 1 &&
      user.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ) {
      flags.push({ type: FlagType.NEW_ACCOUNT_LOW_RATING });
    }

    if (isEdit && flags.length) {
      // Don't stack duplicate flags of a type the review already carries.
      const existing = new Set(
        (
          await this.prisma.reviewFlag.findMany({
            where: { reviewId },
            select: { type: true },
          })
        ).map((f) => f.type),
      );
      for (let i = flags.length - 1; i >= 0; i--) {
        if (existing.has(flags[i].type)) flags.splice(i, 1);
      }
    }

    if (flags.length) {
      await this.prisma.review.update({
        where: { id: reviewId },
        data: { status: ReviewStatus.FLAGGED },
      });
      for (const flag of flags) {
        await this.prisma.reviewFlag.create({
          data: {
            reviewId,
            type: flag.type,
            metadata: flag.metadata,
          },
        });
      }
    }
  }
}
