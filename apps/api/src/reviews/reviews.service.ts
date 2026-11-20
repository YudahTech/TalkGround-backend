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
  EvidenceKind,
  EvidenceStatus,
  FlagType,
  Prisma,
  ReporterType,
  ResolutionStatus,
  ReviewStatus,
  VoteValue,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { envFlag } from '../common/security';
import { cleanText, excerpt, hashIp, hashReviewText } from '../common/utils';
import { pageMeta, skipTake } from '../common/pagination';
import { PUBLIC_REVIEW_STATUSES } from '../common/rating-rules';
import type { AuthUser } from '../common/current-user.decorator';
import { RatingsService } from '../businesses/ratings.service';
import { BusinessAccessService } from '../businesses/business-access.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  PUBLIC_REVIEW_INCLUDE,
  RESOLUTION_LABELS,
  presentReview,
} from './review-presenter';
import type {
  AddEvidenceDto,
  ConsumerResolutionDto,
  CreateReviewDto,
  DimensionScoreDto,
  ReportReviewDto,
  UpdateReviewDto,
} from './reviews.dto';

const DAY = 86_400_000;
const MAX_EVIDENCE = 5;
const MAX_PHOTOS = 3;
/** Statuses the author may still edit. */
const EDITABLE: ReviewStatus[] = [
  ReviewStatus.PUBLISHED,
  ReviewStatus.PENDING_MODERATION,
  ReviewStatus.UNDER_INVESTIGATION,
];
/** Signals strong enough to hold a review for a moderator before it goes public. */
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
    private ratings: RatingsService,
    private access: BusinessAccessService,
    private uploads: UploadsService,
  ) {}

  // ───────────────────────────────────────────────────────────────── rules

  private repeatAfterDays() {
    return Number(this.config.get('REVIEW_REPEAT_AFTER_DAYS', '90')) || 90;
  }
  private maxEdits() {
    return Number(this.config.get('REVIEW_MAX_EDITS', '5')) || 5;
  }
  private dailyLimit() {
    return Number(this.config.get('REVIEW_DAILY_LIMIT', '3')) || 3;
  }

  /** Account requirements for contributing reviews and votes (anti-fabrication, PRD §6.3). */
  private assertVerified(user: AuthUser) {
    if (
      envFlag(this.config.get('REVIEW_REQUIRE_EMAIL_VERIFIED'), true) &&
      !user.emailVerified
    ) {
      throw new ForbiddenException('Verify your email address first');
    }
  }

  /**
   * Validate dimension scores against the business category (PRD §7.6): every key must
   * apply to the category and every required dimension must be scored.
   */
  private async resolveDimensions(
    categoryId: string,
    input: DimensionScoreDto[] | undefined,
  ) {
    const configured = await this.prisma.categoryDimension.findMany({
      where: { categoryId, dimension: { isActive: true } },
      include: { dimension: true },
    });
    const byKey = new Map(configured.map((c) => [c.dimension.key, c]));
    const seen = new Set<string>();
    const scores: { dimensionId: string; score: number; key: string }[] = [];
    for (const d of input ?? []) {
      const key = d.key.trim().toLowerCase();
      const cfg = byKey.get(key);
      if (!cfg) {
        throw new BadRequestException(
          `"${d.key}" is not a rating dimension for this category`,
        );
      }
      if (seen.has(key)) {
        throw new BadRequestException(`Dimension "${key}" was scored twice`);
      }
      seen.add(key);
      scores.push({ dimensionId: cfg.dimensionId, score: d.score, key });
    }
    const missing = configured
      .filter((c) => c.isRequired && !seen.has(c.dimension.key))
      .map((c) => c.dimension.name);
    if (missing.length) {
      throw new BadRequestException(`Please rate: ${missing.join(', ')}`);
    }
    return scores;
  }

  private parseExperienceDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (date.getTime() > Date.now() + DAY) {
      throw new BadRequestException('experienceDate cannot be in the future');
    }
    if (date.getTime() < Date.now() - 5 * 365 * DAY) {
      throw new BadRequestException('experienceDate is more than 5 years ago');
    }
    return date;
  }

  /**
   * Automatic fraud signals. They never decide anything themselves: blocking signals hold
   * the review for a moderator; the rest are recorded for context.
   */
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
    // Nigerian mobile networks put many users behind shared (CGNAT) addresses, so one other
    // account on the same IP is normal; three accounts reviewing one business from it is not.
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
        type: FlagType.NEW_ACCOUNT_LOW_RATING,
        metadata: { rating: input.rating },
      });
    }
    return {
      flags,
      blocking: flags.some((f) => BLOCKING_FLAGS.includes(f.type)),
    };
  }

  private async loadPublic(id: string) {
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
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== user.id) {
      throw new ForbiddenException('This is not your review');
    }
    return review;
  }

  // ────────────────────────────────────────────────────────────── create

  async create(user: AuthUser, dto: CreateReviewDto, ip?: string) {
    this.assertVerified(user);

    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
    });
    if (!business || business.status !== BusinessStatus.PUBLISHED) {
      throw new NotFoundException('Business not found');
    }
    // Conflict of interest (PRD §8.2): representatives cannot review their own business.
    if (await this.access.isManager(user.id, business.id)) {
      throw new ForbiddenException(
        'You manage this business, so you cannot review it',
      );
    }

    const recent = await this.prisma.review.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - DAY) },
      },
    });
    if (recent >= this.dailyLimit()) {
      throw new BadRequestException(
        `You can post at most ${this.dailyLimit()} reviews per 24 hours`,
      );
    }

    // PRD §7.6 repeat-experience rule: one current review per person per business. A new
    // experience may be reviewed once the repeat period has passed; otherwise edit instead.
    const activeKey = `${business.id}:${user.id}`;
    const current = await this.prisma.review.findUnique({
      where: { activeKey },
    });
    if (current) {
      const ageDays = (Date.now() - current.createdAt.getTime()) / DAY;
      if (ageDays < this.repeatAfterDays()) {
        throw new ConflictException({
          message: `You already reviewed this business. Edit your review instead, or review a new experience after ${this.repeatAfterDays()} days.`,
          reviewId: current.id,
        });
      }
      if (!dto.newExperience) {
        throw new ConflictException({
          message:
            'You already reviewed this business. To review a new experience, resend with newExperience: true.',
          reviewId: current.id,
        });
      }
    }

    const dimensions = await this.resolveDimensions(
      business.categoryId,
      dto.dimensions,
    );
    const body = cleanText(dto.body);
    const textHash = hashReviewText(body);
    const ipHash = ip
      ? hashIp(ip, this.config.get('JWT_SECRET', 'dev-secret'))
      : null;
    const signals = await this.fraudSignals({
      userId: user.id,
      businessId: business.id,
      ipHash,
      textHash,
      rating: dto.overallRating,
      isEdit: false,
    });
    const status = signals.blocking
      ? ReviewStatus.PENDING_MODERATION
      : ReviewStatus.PUBLISHED;

    const review = await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.review.update({
          where: { id: current.id },
          data: { activeKey: null, supersededAt: new Date() },
        });
      }
      const created = await tx.review.create({
        data: {
          businessId: business.id,
          userId: user.id,
          overallRating: dto.overallRating,
          title: dto.title ? cleanText(dto.title) : null,
          body,
          experienceDate: this.parseExperienceDate(dto.experienceDate),
          status,
          activeKey,
          textHash,
          ipHash,
          publishedAt: status === ReviewStatus.PUBLISHED ? new Date() : null,
          dimensions: {
            create: dimensions.map((d) => ({
              dimensionId: d.dimensionId,
              score: d.score,
            })),
          },
          flags: { create: signals.flags },
        },
      });
      await this.ratings.recompute(business.id, tx);
      return created;
    });

    return {
      data: {
        ...presentReview(await this.loadPublic(review.id)),
        moderation:
          status === ReviewStatus.PENDING_MODERATION
            ? 'Your review was received and is waiting for a quick check by our moderators before it is published.'
            : null,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────── edit

  /**
   * PRD §7.6: editing keeps every previous version, is capped (REVIEW_MAX_EDITS), and goes
   * through the same fraud checks as a new review.
   */
  async update(user: AuthUser, id: string, dto: UpdateReviewDto, ip?: string) {
    const review = await this.getOwned(user, id);
    if (!EDITABLE.includes(review.status) || review.supersededAt) {
      throw new ForbiddenException('This review can no longer be edited');
    }
    if (review.editCount >= this.maxEdits()) {
      throw new ForbiddenException(
        `Reviews can be edited at most ${this.maxEdits()} times`,
      );
    }
    const old = await this.prisma.review.findUniqueOrThrow({
      where: { id },
      include: { dimensions: { include: { dimension: true } } },
    });

    const body = dto.body !== undefined ? cleanText(dto.body) : old.body;
    const title =
      dto.title !== undefined ? cleanText(dto.title) || null : old.title;
    const overallRating = dto.overallRating ?? old.overallRating;
    const experienceDate =
      dto.experienceDate !== undefined
        ? this.parseExperienceDate(dto.experienceDate)
        : old.experienceDate;
    const dimensions =
      dto.dimensions !== undefined
        ? await this.resolveDimensions(
            review.business.categoryId,
            dto.dimensions,
          )
        : null;

    const oldDims = old.dimensions
      .map((d) => `${d.dimension.key}:${d.score}`)
      .sort()
      .join(',');
    const newDims = dimensions
      ? dimensions
          .map((d) => `${d.key}:${d.score}`)
          .sort()
          .join(',')
      : oldDims;
    const changed =
      body !== old.body ||
      title !== old.title ||
      overallRating !== old.overallRating ||
      (experienceDate?.getTime() ?? null) !==
        (old.experienceDate?.getTime() ?? null) ||
      newDims !== oldDims;
    if (!changed) return { data: presentReview(await this.loadPublic(id)) };

    const textHash = hashReviewText(body);
    const ipHash = ip
      ? hashIp(ip, this.config.get('JWT_SECRET', 'dev-secret'))
      : old.ipHash;
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
          overallRating: old.overallRating,
          title: old.title,
          body: old.body,
          experienceDate: old.experienceDate,
          dimensions: old.dimensions.map((d) => ({
            key: d.dimension.key,
            score: d.score,
          })),
        },
      });
      if (dimensions) {
        await tx.reviewDimension.deleteMany({ where: { reviewId: id } });
        await tx.reviewDimension.createMany({
          data: dimensions.map((d) => ({
            reviewId: id,
            dimensionId: d.dimensionId,
            score: d.score,
          })),
        });
      }
      const holdForModeration =
        signals.blocking && old.status === ReviewStatus.PUBLISHED;
      await tx.review.update({
        where: { id },
        data: {
          body,
          title,
          overallRating,
          experienceDate,
          textHash,
          ipHash,
          editCount: { increment: 1 },
          editedAt: new Date(),
          ...(holdForModeration
            ? { status: ReviewStatus.PENDING_MODERATION }
            : {}),
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
    return { data: presentReview(await this.loadPublic(id)) };
  }

  /** Author withdraws the review. It disappears publicly; history is kept for moderation. */
  async withdraw(user: AuthUser, id: string) {
    const review = await this.getOwned(user, id);
    if (
      review.status === ReviewStatus.WITHDRAWN ||
      review.status === ReviewStatus.REMOVED
    ) {
      throw new BadRequestException('This review is not public');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id },
        data: { status: ReviewStatus.WITHDRAWN, activeKey: null },
      });
      await this.ratings.recompute(review.businessId, tx);
    });
    return { data: { message: 'Your review was withdrawn' } };
  }

  // ─────────────────────────────────────────────────────────────── reads

  async getOne(id: string, viewer?: AuthUser | null) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        ...PUBLIC_REVIEW_INCLUDE,
        resolutionEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    const isAuthor = !!viewer && review?.userId === viewer.id;
    if (
      !review ||
      (!PUBLIC_REVIEW_STATUSES.includes(review.status) && !isAuthor)
    ) {
      throw new NotFoundException('Review not found');
    }
    const vote = viewer
      ? await this.prisma.helpfulVote.findUnique({
          where: { reviewId_userId: { reviewId: id, userId: viewer.id } },
        })
      : null;
    return {
      data: {
        ...presentReview(review, {
          myVote: vote?.value ?? null,
          includeBusiness: true,
        }),
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

  /** Previous versions — visible to the author (staff use the admin endpoint). */
  async revisions(user: AuthUser, id: string) {
    await this.getOwned(user, id);
    const rows = await this.prisma.reviewRevision.findMany({
      where: { reviewId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows };
  }

  /** "View their review history" (PRD §7.6) — every status, including held and removed. */
  async mine(userId: string, page: number, limit: number) {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(page, limit),
        include: {
          business: { select: { id: true, slug: true, name: true } },
          response: { select: { status: true } },
          _count: {
            select: {
              helpfulVotes: { where: { value: VoteValue.HELPFUL } },
              evidence: true,
            },
          },
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
        earlierExperience: !!r.supersededAt,
        resolution: {
          status: r.resolutionStatus.toLowerCase(),
          label: RESOLUTION_LABELS[r.resolutionStatus],
        },
        hasBusinessResponse: r.response?.status === 'PUBLISHED',
        helpfulCount: r._count.helpfulVotes,
        evidenceCount: r._count.evidence,
        editCount: r.editCount,
        editsRemaining: Math.max(0, this.maxEdits() - r.editCount),
        createdAt: r.createdAt,
        editedAt: r.editedAt,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  // ──────────────────────────────────────────────────────────── evidence

  async addEvidence(user: AuthUser, id: string, dto: AddEvidenceDto) {
    const review = await this.getOwned(user, id);
    if (!EDITABLE.includes(review.status)) {
      throw new ForbiddenException(
        'Evidence can no longer be added to this review',
      );
    }
    const isPhoto = dto.kind === EvidenceKind.PHOTO;
    const asset = await this.uploads.verifyAsset(
      dto.url,
      isPhoto ? 'evidence' : 'evidence-private',
    );
    const [count, photos] = await Promise.all([
      this.prisma.reviewEvidence.count({ where: { reviewId: id } }),
      this.prisma.reviewEvidence.count({
        where: { reviewId: id, kind: EvidenceKind.PHOTO },
      }),
    ]);
    if (count >= MAX_EVIDENCE) {
      throw new BadRequestException(`At most ${MAX_EVIDENCE} files per review`);
    }
    if (isPhoto && photos >= MAX_PHOTOS) {
      throw new BadRequestException(`At most ${MAX_PHOTOS} photos per review`);
    }
    const evidence = await this.prisma.reviewEvidence.create({
      data: {
        reviewId: id,
        kind: dto.kind,
        url: asset.url,
        publicId: asset.publicId,
        isPrivate: !isPhoto,
      },
    });
    // A private file's URL is never echoed back; the client only needs to know it was accepted.
    return {
      data: {
        id: evidence.id,
        kind: evidence.kind.toLowerCase(),
        isPrivate: evidence.isPrivate,
        status: evidence.status.toLowerCase(),
        ...(evidence.isPrivate ? {} : { url: evidence.url }),
        createdAt: evidence.createdAt,
      },
    };
  }

  async removeEvidence(user: AuthUser, id: string, evidenceId: string) {
    await this.getOwned(user, id);
    const ev = await this.prisma.reviewEvidence.findFirst({
      where: { id: evidenceId, reviewId: id },
    });
    if (!ev) throw new NotFoundException('Evidence not found');
    if (ev.status === EvidenceStatus.ACCEPTED) {
      // Reviewed evidence backs a public label; removing it silently would mislead readers.
      throw new ForbiddenException(
        'Evidence that has been reviewed cannot be removed',
      );
    }
    await this.prisma.reviewEvidence.delete({ where: { id: evidenceId } });
    return { data: { message: 'Evidence removed' } };
  }

  // ─────────────────────────────────────────────────────────────── votes

  private async publicReview(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review || !PUBLIC_REVIEW_STATUSES.includes(review.status)) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }

  /** PRD §7.9: one active vote per user per review; changeable; removable. */
  async vote(user: AuthUser, id: string, helpful: boolean) {
    this.assertVerified(user);
    const review = await this.publicReview(id);
    if (review.userId === user.id) {
      throw new BadRequestException('You cannot vote on your own review');
    }
    if (await this.access.isManager(user.id, review.businessId)) {
      throw new ForbiddenException(
        'Business representatives cannot vote on reviews of their business',
      );
    }
    const value = helpful ? VoteValue.HELPFUL : VoteValue.NOT_HELPFUL;
    await this.prisma.helpfulVote.upsert({
      where: { reviewId_userId: { reviewId: id, userId: user.id } },
      create: { reviewId: id, userId: user.id, value },
      update: { value },
    });
    return this.voteState(id, value);
  }

  async removeVote(user: AuthUser, id: string) {
    await this.prisma.helpfulVote.deleteMany({
      where: { reviewId: id, userId: user.id },
    });
    return this.voteState(id, null);
  }

  private async voteState(reviewId: string, myVote: VoteValue | null) {
    const helpfulCount = await this.prisma.helpfulVote.count({
      where: { reviewId, value: VoteValue.HELPFUL },
    });
    return { data: { myVote: myVote?.toLowerCase() ?? null, helpfulCount } };
  }

  // ───────────────────────────────────────────────────────────── reports

  /**
   * PRD §8.3. Reports go to the moderation queue. They do NOT hide the review on their own:
   * a negative review must not disappear just because it was reported (PRD §8.2).
   */
  async report(user: AuthUser, id: string, dto: ReportReviewDto) {
    const review = await this.publicReview(id);
    if (review.userId === user.id) {
      throw new BadRequestException('You cannot report your own review');
    }
    const asBusiness = await this.access.isManager(user.id, review.businessId);
    try {
      const report = await this.prisma.reviewReport.create({
        data: {
          reviewId: id,
          reporterId: user.id,
          reporterType: asBusiness
            ? ReporterType.BUSINESS
            : ReporterType.CONSUMER,
          businessId: asBusiness ? review.businessId : null,
          reason: dto.reason,
          details: dto.details ? cleanText(dto.details) : null,
          openKey: `${id}:${user.id}`,
        },
      });
      return {
        data: {
          id: report.id,
          status: 'open',
          message: 'Thanks. Our moderators will review this report.',
        },
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already have an open report on this review',
        );
      }
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────── resolution

  /**
   * PRD §7.8: only the consumer can report a complaint resolved (or reopen it). The history
   * is kept, and the rating is never touched.
   */
  async consumerResolution(
    user: AuthUser,
    id: string,
    dto: ConsumerResolutionDto,
  ) {
    const review = await this.getOwned(user, id);
    if (!PUBLIC_REVIEW_STATUSES.includes(review.status)) {
      throw new BadRequestException('This review is not public');
    }
    let next: ResolutionStatus;
    if (dto.status === 'resolved') {
      if (review.resolutionStatus === ResolutionStatus.RESOLVED_BY_CONSUMER) {
        throw new BadRequestException('Already reported as resolved');
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
      next = ResolutionStatus.DISPUTE_REOPENED;
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
    return {
      data: { status: next.toLowerCase(), label: RESOLUTION_LABELS[next] },
    };
  }
}
