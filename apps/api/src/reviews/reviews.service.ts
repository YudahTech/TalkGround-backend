import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  BusinessStatus,
  EvidenceStatus,
  EvidenceType,
  FlagType,
  Prisma,
  ReporterType,
  ResolutionStatus,
  ResponseStatus,
  ReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../common/app-config';
import { cleanText, excerpt, hashIp, hashReviewText } from '../common/utils';
import { pageMeta, skipTake } from '../common/pagination';
import { VISIBLE_REVIEW_WHERE } from '../common/rating-rules';
import type { AuthUser } from '../common/current-user.decorator';
import { RatingsService } from '../businesses/ratings.service';
import { BusinessAccessService } from '../businesses/business-access.service';
import { UploadsService } from '../uploads/uploads.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import {
  PUBLIC_REVIEW_INCLUDE,
  RESOLUTION_LABELS,
  isUnderInvestigation,
  presentReview,
} from './review-presenter';
import { refreshUnderInvestigation } from './investigation';
import type {
  AddEvidenceDto,
  ConsumerResolutionDto,
  CreateReviewDto,
  DimensionValueDto,
  ReportDto,
  UpdateReviewDto,
} from './reviews.dto';
import type {
  EvidenceCreatedDto,
  HelpfulStateDto,
  MyReviewDto,
  ReportReceiptDto,
  ReviewCreatedDto,
  ReviewDetailDto,
  ReviewDto,
} from './reviews.responses';

const DAY = 86_400_000;
const MAX_EVIDENCE = 5;
const MAX_PHOTOS = 3;
/** Statuses the author may still edit. */
const EDITABLE: ReviewStatus[] = [
  ReviewStatus.PENDING,
  ReviewStatus.PUBLISHED,
  ReviewStatus.UNDER_INVESTIGATION,
];
/**
 * Internal anti-spam signals (PRD §7.12, §12.2). Blocking signals only HOLD a new or edited
 * review in PENDING for a moderator; they never change ratings, ranking or what is displayed.
 */
const BLOCKING_FLAGS: FlagType[] = [
  FlagType.DUPLICATE_TEXT,
  FlagType.IP_MATCH,
  FlagType.VELOCITY,
];

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private appConfig: AppConfig,
    private ratings: RatingsService,
    private access: BusinessAccessService,
    private uploads: UploadsService,
    private revalidate: RevalidationService,
  ) {}

  // ───────────────────────────────────────────────────────────────── rules

  /** PRD §7.1: verified email required; phone only when REQUIRE_PHONE_VERIFIED_FOR_REVIEWS. */
  private assertCanReview(user: AuthUser) {
    if (this.appConfig.requireEmailVerified && !user.emailVerified) {
      throw new ForbiddenException(
        'Verify your email address before writing a review',
      );
    }
    if (this.appConfig.requirePhoneVerifiedForReviews && !user.phoneVerified) {
      throw new ForbiddenException(
        'Verify your phone number before writing a review',
      );
    }
  }

  private assertBody(body: string) {
    const min = this.appConfig.reviewBodyMinLength;
    if (body.length < min) {
      throw new BadRequestException(
        `The review must be at least ${min} characters`,
      );
    }
  }

  /** PRD §7.6: only the category's dimensions; required ones must be rated. */
  private async resolveDimensions(
    categoryId: string,
    input: DimensionValueDto[] | undefined,
  ) {
    const configured = await this.prisma.categoryDimension.findMany({
      where: { categoryId, dimension: { active: true } },
      include: { dimension: true },
    });
    const byKey = new Map(configured.map((c) => [c.dimension.key, c]));
    const seen = new Set<string>();
    const values: { dimensionId: string; value: number; key: string }[] = [];
    for (const d of input ?? []) {
      const key = d.key.trim().toLowerCase();
      const cfg = byKey.get(key);
      if (!cfg)
        throw new BadRequestException(
          `"${d.key}" is not a rating dimension for this category`,
        );
      if (seen.has(key))
        throw new BadRequestException(`Dimension "${key}" was rated twice`);
      seen.add(key);
      values.push({ dimensionId: cfg.dimensionId, value: d.value, key });
    }
    const missing = configured
      .filter((c) => c.required && !seen.has(c.dimension.key))
      .map((c) => c.dimension.label);
    if (missing.length)
      throw new BadRequestException(`Please rate: ${missing.join(', ')}`);
    return values;
  }

  private async fraudSignals(input: {
    reviewId?: string;
    userId: string;
    businessId: string;
    ipHash: string | null;
    textHash: string;
    rating: number;
    isEdit: boolean;
  }) {
    const flags: { type: FlagType; metadata?: Prisma.InputJsonValue }[] = [];
    const [ipMatches, dupes, velocity, user] = await Promise.all([
      input.ipHash
        ? this.prisma.review.count({
            where: {
              businessId: input.businessId,
              ipHash: input.ipHash,
              userId: { not: input.userId },
              createdAt: { gte: new Date(Date.now() - 30 * DAY) },
            },
          })
        : 0,
      this.prisma.review.count({
        where: {
          textHash: input.textHash,
          ...(input.reviewId ? { id: { not: input.reviewId } } : {}),
        },
      }),
      input.isEdit
        ? 0
        : this.prisma.review.count({
            where: {
              businessId: input.businessId,
              createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
            },
          }),
      this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { createdAt: true },
      }),
    ]);
    // Shared (CGNAT) mobile IPs are common in Nigeria: only 3+ accounts on one IP for one business is a signal.
    if (ipMatches >= 2)
      flags.push({ type: FlagType.IP_MATCH, metadata: { count: ipMatches } });
    if (dupes > 0)
      flags.push({ type: FlagType.DUPLICATE_TEXT, metadata: { count: dupes } });
    if (velocity >= 5)
      flags.push({ type: FlagType.VELOCITY, metadata: { lastHour: velocity } });
    if (
      user &&
      (input.rating === 1 || input.rating === 5) &&
      user.createdAt > new Date(Date.now() - DAY)
    ) {
      flags.push({
        type: FlagType.NEW_ACCOUNT_EXTREME_RATING,
        metadata: { rating: input.rating },
      });
    }
    return {
      flags,
      blocking: flags.some((f) => BLOCKING_FLAGS.includes(f.type)),
    };
  }

  private load(id: string) {
    return this.prisma.review.findUniqueOrThrow({
      where: { id },
      include: PUBLIC_REVIEW_INCLUDE,
    });
  }

  private async getOwned(user: AuthUser, id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        business: { select: { id: true, categoryId: true, status: true } },
      },
    });
    if (!review || review.deletedAt)
      throw new NotFoundException('Review not found');
    if (review.userId !== user.id)
      throw new ForbiddenException('This is not your review');
    return review;
  }

  private ipHash(ip?: string) {
    return ip ? hashIp(ip, this.config.get('JWT_SECRET', 'dev-secret')) : null;
  }

  // ────────────────────────────────────────────────────────────── create

  async create(
    user: AuthUser,
    dto: CreateReviewDto,
    ip?: string,
  ): Promise<{ data: ReviewCreatedDto }> {
    this.assertCanReview(user);
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
    });
    if (!business || business.status !== BusinessStatus.PUBLISHED) {
      throw new NotFoundException('Business not found');
    }
    if (await this.access.isManager(user.id, business.id)) {
      throw new ForbiddenException(
        'You manage this business, so you cannot review it',
      );
    }
    // §7.6: one active review per user per business — a repeat experience updates it.
    const existing = await this.prisma.review.findUnique({
      where: { activeKey: `${business.id}:${user.id}` },
    });
    if (existing) {
      throw new ConflictException({
        message:
          'You already reviewed this business. Update your existing review to describe a new experience.',
        reviewId: existing.id,
      });
    }
    const recent = await this.prisma.review.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - DAY) },
      },
    });
    if (recent >= this.appConfig.reviewDailyLimit) {
      throw new BadRequestException(
        `You can post at most ${this.appConfig.reviewDailyLimit} reviews per 24 hours`,
      );
    }
    const body = cleanText(dto.body);
    this.assertBody(body);
    const dimensions = await this.resolveDimensions(
      business.categoryId,
      dto.dimensions,
    );
    const textHash = hashReviewText(body);
    const ipHash = this.ipHash(ip);
    const signals = await this.fraudSignals({
      userId: user.id,
      businessId: business.id,
      ipHash,
      textHash,
      rating: dto.overallRating,
      isEdit: false,
    });
    const status = signals.blocking
      ? ReviewStatus.PENDING
      : ReviewStatus.PUBLISHED;

    let review;
    try {
      review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: {
            businessId: business.id,
            userId: user.id,
            overallRating: dto.overallRating,
            title: cleanText(dto.title),
            body,
            recommend: dto.recommend ?? null,
            status,
            activeKey: `${business.id}:${user.id}`,
            textHash,
            ipHash,
            publishedAt: status === ReviewStatus.PUBLISHED ? new Date() : null,
            dimensionRatings: {
              create: dimensions.map((d) => ({
                dimensionId: d.dimensionId,
                value: d.value,
              })),
            },
            flags: { create: signals.flags },
          },
        });
        await this.ratings.recompute(business.id, tx);
        return created;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already reviewed this business. Update your existing review instead.',
        );
      }
      throw err;
    }
    if (status === ReviewStatus.PUBLISHED)
      void this.revalidate.business(business.id);
    return {
      data: {
        ...presentReview(await this.load(review.id)),
        moderation:
          status === ReviewStatus.PENDING
            ? 'Your review was received and is waiting for a quick check by our moderators before it is published.'
            : null,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────── edit

  /**
   * PRD §7.6: a repeat experience is an update. Every previous version is kept (moderators see
   * the history; the public sees "Edited" with a date). Edits run the same anti-spam checks.
   */
  async update(
    user: AuthUser,
    id: string,
    dto: UpdateReviewDto,
    ip?: string,
  ): Promise<{ data: ReviewDto }> {
    const review = await this.getOwned(user, id);
    if (!EDITABLE.includes(review.status)) {
      throw new ForbiddenException(
        'This review was suspended or removed by a moderator and cannot be edited',
      );
    }
    const old = await this.prisma.review.findUniqueOrThrow({
      where: { id },
      include: { dimensionRatings: { include: { dimension: true } } },
    });
    const body = dto.body !== undefined ? cleanText(dto.body) : old.body;
    if (dto.body !== undefined) this.assertBody(body);
    const title = dto.title !== undefined ? cleanText(dto.title) : old.title;
    const overallRating = dto.overallRating ?? old.overallRating;
    const recommend =
      dto.recommend !== undefined ? dto.recommend : old.recommend;
    const dimensions =
      dto.dimensions !== undefined
        ? await this.resolveDimensions(
            review.business.categoryId,
            dto.dimensions,
          )
        : null;

    const sig = (list: { key: string; value: number }[]) =>
      list
        .map((d) => `${d.key}:${d.value}`)
        .sort()
        .join(',');
    const oldDims = old.dimensionRatings.map((d) => ({
      key: d.dimension.key,
      value: d.value,
    }));
    const changed =
      body !== old.body ||
      title !== old.title ||
      overallRating !== old.overallRating ||
      recommend !== old.recommend ||
      (dimensions !== null && sig(dimensions) !== sig(oldDims));
    if (!changed) return { data: presentReview(await this.load(id)) };

    const textHash = hashReviewText(body);
    const signals = await this.fraudSignals({
      reviewId: id,
      userId: user.id,
      businessId: old.businessId,
      ipHash: null,
      textHash,
      rating: overallRating,
      isEdit: true,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewRevision.create({
        data: {
          reviewId: id,
          snapshot: {
            overallRating: old.overallRating,
            title: old.title,
            body: old.body,
            recommend: old.recommend,
            dimensions: oldDims,
            editedBy: 'author',
          },
        },
      });
      if (dimensions) {
        await tx.reviewDimensionRating.deleteMany({ where: { reviewId: id } });
        await tx.reviewDimensionRating.createMany({
          data: dimensions.map((d) => ({
            reviewId: id,
            dimensionId: d.dimensionId,
            value: d.value,
          })),
        });
      }
      const hold = signals.blocking && old.status === ReviewStatus.PUBLISHED;
      await tx.review.update({
        where: { id },
        data: {
          body,
          title,
          overallRating,
          recommend,
          textHash,
          ipHash: this.ipHash(ip) ?? old.ipHash,
          editCount: { increment: 1 },
          editedAt: new Date(),
          ...(hold ? { status: ReviewStatus.PENDING } : {}),
        },
      });
      if (signals.flags.length) {
        await tx.reviewFlag.createMany({
          data: signals.flags.map((f) => ({
            reviewId: id,
            type: f.type,
            metadata: f.metadata,
          })),
        });
      }
      await this.ratings.recompute(old.businessId, tx);
    });
    void this.revalidate.business(old.businessId);
    return { data: presentReview(await this.load(id)) };
  }

  /** PRD §7.6: soft delete by the author. Hidden publicly; the record is kept for moderation and audit. */
  async softDelete(user: AuthUser, id: string) {
    const review = await this.getOwned(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id },
        data: { deletedAt: new Date(), activeKey: null },
      });
      await this.ratings.recompute(review.businessId, tx);
    });
    void this.revalidate.business(review.businessId);
    return { data: { message: 'Your review was deleted' } };
  }

  // ─────────────────────────────────────────────────────────────── reads

  async getOne(
    id: string,
    viewer?: AuthUser | null,
  ): Promise<{ data: ReviewDetailDto }> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        ...PUBLIC_REVIEW_INCLUDE,
        resolutionEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    const isAuthor = !!viewer && review?.userId === viewer.id;
    const visible =
      !!review &&
      !review.deletedAt &&
      (review.status === ReviewStatus.PUBLISHED ||
        review.status === ReviewStatus.UNDER_INVESTIGATION);
    if (!review || (!visible && !(isAuthor && !review.deletedAt)))
      throw new NotFoundException('Review not found');
    const voted = viewer
      ? !!(await this.prisma.helpfulVote.findUnique({
          where: { reviewId_userId: { reviewId: id, userId: viewer.id } },
        }))
      : null;
    return {
      data: {
        ...presentReview(review, { helpfulByMe: voted, includeBusiness: true }),
        resolutionHistory: review.resolutionEvents.map((e) => ({
          status: e.status.toLowerCase(),
          label: RESOLUTION_LABELS[e.status],
          by: e.actorType.toLowerCase(),
          note: e.note,
          at: e.createdAt,
        })),
        isMine: isAuthor,
      },
    };
  }

  async revisions(user: AuthUser, id: string) {
    await this.getOwned(user, id);
    const rows = await this.prisma.reviewRevision.findMany({
      where: { reviewId: id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        snapshot: r.snapshot as Record<string, unknown>,
        createdAt: r.createdAt,
      })),
    };
  }

  /** The user's own reviews, every status (PRD §7.6 "manage the review"). */
  async mine(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ data: MyReviewDto[]; meta: ReturnType<typeof pageMeta> }> {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(page, limit),
        include: {
          business: { select: { id: true, slug: true, name: true } },
          response: { select: { status: true } },
          _count: { select: { helpfulVotes: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        business: r.business,
        overallRating: r.overallRating,
        title: r.title,
        excerpt: excerpt(r.body),
        status: r.status.toLowerCase(),
        deleted: !!r.deletedAt,
        resolution: {
          status: r.resolutionStatus.toLowerCase(),
          label: RESOLUTION_LABELS[r.resolutionStatus],
        },
        hasBusinessResponse: r.response?.status === ResponseStatus.PUBLISHED,
        helpfulCount: r._count.helpfulVotes,
        evidenceAttached: r.evidenceAttached,
        evidenceStatus: r.evidenceStatus.toLowerCase(),
        underInvestigation: isUnderInvestigation(r),
        createdAt: r.createdAt,
        editedAt: r.editedAt,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  // ──────────────────────────────────────────────────────────── evidence

  async addEvidence(
    user: AuthUser,
    id: string,
    dto: AddEvidenceDto,
  ): Promise<{ data: EvidenceCreatedDto }> {
    const review = await this.getOwned(user, id);
    if (!EDITABLE.includes(review.status))
      throw new ForbiddenException(
        'Evidence can no longer be added to this review',
      );
    const isPhoto = dto.type === EvidenceType.PHOTO;
    const asset = await this.uploads.verifyAsset(
      dto.url,
      isPhoto ? 'evidence' : 'receipts',
    );
    const [count, photos] = await Promise.all([
      this.prisma.reviewEvidence.count({ where: { reviewId: id } }),
      this.prisma.reviewEvidence.count({
        where: { reviewId: id, type: EvidenceType.PHOTO },
      }),
    ]);
    if (count >= MAX_EVIDENCE)
      throw new BadRequestException(`At most ${MAX_EVIDENCE} files per review`);
    if (isPhoto && photos >= MAX_PHOTOS)
      throw new BadRequestException(`At most ${MAX_PHOTOS} photos per review`);
    const evidence = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reviewEvidence.create({
        data: {
          reviewId: id,
          type: dto.type,
          url: asset.url,
          publicId: asset.publicId,
          isPrivate: !isPhoto,
        },
      });
      // New, unexamined evidence: "Evidence attached", and any earlier decision no longer covers it.
      await tx.review.update({
        where: { id },
        data: {
          evidenceAttached: true,
          evidenceStatus: EvidenceStatus.NOT_REVIEWED,
        },
      });
      return created;
    });
    void this.revalidate.business(review.businessId);
    return {
      data: {
        id: evidence.id,
        type: evidence.type.toLowerCase(),
        isPrivate: evidence.isPrivate,
        ...(evidence.isPrivate ? {} : { url: evidence.url }),
        createdAt: evidence.createdAt,
      },
    };
  }

  async removeEvidence(user: AuthUser, id: string, evidenceId: string) {
    const review = await this.getOwned(user, id);
    if (review.evidenceStatus === EvidenceStatus.ACCEPTED) {
      // Reviewed evidence backs a public label; removing it would make the label misleading.
      throw new ForbiddenException(
        'Evidence that a moderator has reviewed cannot be removed',
      );
    }
    const ev = await this.prisma.reviewEvidence.findFirst({
      where: { id: evidenceId, reviewId: id },
    });
    if (!ev) throw new NotFoundException('Evidence not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewEvidence.delete({ where: { id: evidenceId } });
      const left = await tx.reviewEvidence.count({ where: { reviewId: id } });
      if (!left)
        await tx.review.update({
          where: { id },
          data: {
            evidenceAttached: false,
            evidenceStatus: EvidenceStatus.NOT_REVIEWED,
          },
        });
    });
    void this.revalidate.business(review.businessId);
    return { data: { message: 'Evidence removed' } };
  }

  // ─────────────────────────────────────────────────────────────── votes

  private async visibleReview(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (
      !review ||
      review.deletedAt ||
      !(
        review.status === ReviewStatus.PUBLISHED ||
        review.status === ReviewStatus.UNDER_INVESTIGATION
      )
    ) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }

  /** PRD §7.9: one vote per user per review, toggled. Affects review ordering only. */
  async toggleHelpful(
    user: AuthUser,
    id: string,
  ): Promise<{ data: HelpfulStateDto }> {
    const review = await this.visibleReview(id);
    if (review.userId === user.id)
      throw new BadRequestException('You cannot vote on your own review');
    if (await this.access.isManager(user.id, review.businessId)) {
      throw new ForbiddenException(
        'Business members cannot vote on reviews of their business',
      );
    }
    const key = { reviewId_userId: { reviewId: id, userId: user.id } };
    const existing = await this.prisma.helpfulVote.findUnique({ where: key });
    if (existing) await this.prisma.helpfulVote.delete({ where: key });
    else
      await this.prisma.helpfulVote
        .create({ data: { reviewId: id, userId: user.id } })
        .catch(() => undefined);
    const helpfulCount = await this.prisma.helpfulVote.count({
      where: { reviewId: id },
    });
    return { data: { helpful: !existing, helpfulCount } };
  }

  // ───────────────────────────────────────────────────────────── reports

  /**
   * PRD §8.3: consumers and business members can report. The review stays visible and is labelled
   * "Under investigation" while the report is open (§6.4); nothing is hidden or removed by a report.
   * The reported party is never told who reported.
   */
  async report(
    user: AuthUser,
    id: string,
    dto: ReportDto,
    target: 'review' | 'response',
  ): Promise<{ data: ReportReceiptDto }> {
    const review = await this.visibleReview(id);
    let responseId: string | null = null;
    if (target === 'review') {
      if (review.userId === user.id)
        throw new BadRequestException('You cannot report your own review');
    } else {
      const response = await this.prisma.businessResponse.findUnique({
        where: { reviewId: id },
      });
      if (!response || response.status !== ResponseStatus.PUBLISHED)
        throw new NotFoundException('Response not found');
      if (await this.access.isManager(user.id, response.businessId)) {
        throw new BadRequestException(
          'You cannot report your own business response',
        );
      }
      responseId = response.id;
    }
    const asBusiness = await this.access.isManager(user.id, review.businessId);
    try {
      const report = await this.prisma.$transaction(async (tx) => {
        const created = await tx.reviewReport.create({
          data: {
            reviewId: id,
            responseId,
            reporterId: user.id,
            reporterType: asBusiness
              ? ReporterType.BUSINESS
              : ReporterType.CONSUMER,
            businessId: asBusiness ? review.businessId : null,
            reasonCode: dto.reasonCode,
            note: dto.note ? cleanText(dto.note) : null,
            openKey: `${responseId ?? id}:${user.id}`,
          },
        });
        if (target === 'review') await refreshUnderInvestigation(tx, id);
        return created;
      });
      void this.revalidate.business(review.businessId);
      return {
        data: {
          id: report.id,
          status: 'open',
          message: 'Thank you. Our moderators will look at this report.',
        },
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('You already have an open report on this');
      }
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────── resolution

  /** PRD §7.8: only the reviewer can mark a complaint resolved or reopen it. Never changes the rating. */
  async consumerResolution(
    user: AuthUser,
    id: string,
    dto: ConsumerResolutionDto,
  ) {
    const review = await this.getOwned(user, id);
    let next: ResolutionStatus;
    if (dto.status === 'resolved') {
      if (review.resolutionStatus === ResolutionStatus.RESOLVED_BY_CONSUMER) {
        throw new BadRequestException('Already marked resolved');
      }
      next = ResolutionStatus.RESOLVED_BY_CONSUMER;
    } else {
      const reopenable: ResolutionStatus[] = [
        ResolutionStatus.RESOLVED_BY_CONSUMER,
        ResolutionStatus.RESOLUTION_PROPOSED,
      ];
      if (!reopenable.includes(review.resolutionStatus)) {
        throw new BadRequestException(
          'Only a proposed or reported resolution can be reopened',
        );
      }
      next = ResolutionStatus.REOPENED;
    }
    await this.prisma.$transaction([
      this.prisma.review.update({
        where: { id },
        data: { resolutionStatus: next },
      }),
      this.prisma.resolutionEvent.create({
        data: {
          reviewId: id,
          status: next,
          actorType: ActorType.CONSUMER,
          actorId: user.id,
          note: dto.note ? cleanText(dto.note) : null,
        },
      }),
    ]);
    void this.revalidate.business(review.businessId);
    return {
      data: { status: next.toLowerCase(), label: RESOLUTION_LABELS[next] },
    };
  }
}

export { VISIBLE_REVIEW_WHERE };
