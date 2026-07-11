import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FlagType,
  MediaType,
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
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // Phone/email verification gate disabled for early launch.
  // Re-enable when Termii/Resend are live — require both verified before create.
  // private ensureCanReview(user: { emailVerified: boolean; phoneVerified: boolean }) {
  //   if (!user.emailVerified || !user.phoneVerified) {
  //     throw new ForbiddenException('Verify email and phone before writing reviews');
  //   }
  // }

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
      edited: review.updatedAt > review.createdAt,
      author: {
        displayName: review.user.displayName,
        username: review.user.username,
      },
      photos: (review.media ?? [])
        .filter((m) => m.type === MediaType.PHOTO)
        .map((m) => ({ id: m.id, url: m.url })),
      hasReceipt: (review.media ?? []).some((m) => m.type === MediaType.RECEIPT),
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
              ? [{ verifiedVisit: 'desc' as const }, { createdAt: 'desc' as const }]
              : { createdAt: 'desc' as const };

    const where = {
      brandId: brand.id,
      status: {
        in: [ReviewStatus.PUBLISHED, ReviewStatus.PENDING_VERIFICATION],
      },
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

  async create(
    user: { id: string },
    dto: CreateReviewDto,
    ip?: string,
  ) {
    // Logged-in users can review (OTP verification deferred until Termii is live)

    const brand = await this.prisma.brand.findUnique({
      where: { id: dto.brandId },
    });
    if (!brand) throw new NotFoundException('Brand not found');

    const existing = await this.prisma.review.findUnique({
      where: { brandId_userId: { brandId: dto.brandId, userId: user.id } },
    });
    if (existing && existing.status !== ReviewStatus.REMOVED) {
      throw new ConflictException('You already reviewed this brand');
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

    const review = await this.prisma.review.create({
      data: {
        brandId: dto.brandId,
        userId: user.id,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        pros: dto.pros,
        cons: dto.cons,
        recommend: dto.recommend,
        ipHash,
        textHash,
        status: ReviewStatus.PUBLISHED,
      },
      include: {
        user: { select: { displayName: true, username: true } },
        media: true,
        _count: { select: { helpfulVotes: true } },
      },
    });

    await this.runTrustChecks(review.id, user.id, dto.brandId, ipHash, textHash, dto.rating);

    return { data: this.mapReview({ ...review, viewCount: review.viewCount }) };
  }

  async update(user: { id: string }, id: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== user.id) throw new ForbiddenException();

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        ...dto,
        textHash: dto.body ? hashReviewText(dto.body) : undefined,
      },
      include: {
        user: { select: { displayName: true, username: true } },
        media: true,
      },
    });

    return { data: this.mapReview(updated) };
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

    const type =
      dto.type === 'receipt' ? MediaType.RECEIPT : MediaType.PHOTO;

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
      await this.prisma.review.update({
        where: { id },
        data: { status: ReviewStatus.PENDING_VERIFICATION },
      });
    }

    const media = await this.prisma.reviewMedia.create({
      data: { reviewId: id, type, url: dto.url },
    });

    return { data: media };
  }

  async report(user: { id: string }, id: string, dto: ReportReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');

    const report = await this.prisma.reviewReport.create({
      data: {
        reviewId: id,
        reporterId: user.id,
        reason: dto.reason,
        note: dto.note,
      },
    });

    return { data: report };
  }

  async toggleHelpful(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    const existing = await this.prisma.reviewHelpfulVote.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
    });

    if (existing) {
      await this.prisma.reviewHelpfulVote.delete({ where: { id: existing.id } });
      const count = await this.prisma.reviewHelpfulVote.count({ where: { reviewId } });
      return { data: { helpful: false, helpfulCount: count } };
    }

    await this.prisma.reviewHelpfulVote.create({
      data: { reviewId, userId },
    });
    const count = await this.prisma.reviewHelpfulVote.count({ where: { reviewId } });
    return { data: { helpful: true, helpfulCount: count } };
  }

  async recordView(reviewId: string) {
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

    const dupes = await this.prisma.review.count({
      where: {
        textHash,
        id: { not: reviewId },
      },
    });
    if (dupes > 0) {
      flags.push({ type: FlagType.DUPLICATE_TEXT, metadata: { count: dupes } });
    }

    const velocity = await this.prisma.review.count({
      where: {
        brandId,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (velocity > 5) {
      flags.push({ type: FlagType.VELOCITY, metadata: { count: velocity } });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      user &&
      rating === 1 &&
      user.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ) {
      flags.push({ type: FlagType.NEW_ACCOUNT_LOW_RATING });
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
