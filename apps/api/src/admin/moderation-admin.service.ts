import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DisputeStatus,
  EvidenceStatus,
  ModerationActionType,
  ModerationTarget,
  PolicyReason,
  Prisma,
  ReportStatus,
  ResponseStatus,
  ReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { RatingsService } from '../businesses/ratings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { refreshUnderInvestigation } from '../reviews/investigation';
import { PERMISSIONS } from '../common/permissions';
import { pageMeta, skipTake } from '../common/pagination';
import { cleanText, excerpt } from '../common/utils';
import type { AuthUser } from '../common/current-user.decorator';
import type {
  DecideDisputeDto,
  DecideReportDto,
  EditReviewContentDto,
  EvidenceStatusDto,
  ModerateReviewDto,
  RemoveResponseDto,
  ReviewAction,
  ReviewQueueQueryDto,
} from './admin.dto';
import type {
  AdminDisputeDetailDto,
  AdminDisputeDto,
  AdminReportDto,
  AdminReviewDetailDto,
  ModerationResultDto,
  QueueItemDto,
} from './admin.responses';

type Db = Prisma.TransactionClient | PrismaService;

/** Allowed review status changes (PRD §7.6 statuses). */
const TRANSITIONS: Record<
  ReviewAction,
  { from: ReviewStatus[]; to: ReviewStatus; type: ModerationActionType }
> = {
  publish: {
    from: [ReviewStatus.PENDING],
    to: ReviewStatus.PUBLISHED,
    type: ModerationActionType.PUBLISH,
  },
  suspend: {
    from: [
      ReviewStatus.PENDING,
      ReviewStatus.PUBLISHED,
      ReviewStatus.UNDER_INVESTIGATION,
    ],
    to: ReviewStatus.SUSPENDED,
    type: ModerationActionType.SUSPEND,
  },
  remove: {
    from: [
      ReviewStatus.PENDING,
      ReviewStatus.PUBLISHED,
      ReviewStatus.UNDER_INVESTIGATION,
      ReviewStatus.SUSPENDED,
    ],
    to: ReviewStatus.REMOVED,
    type: ModerationActionType.REMOVE,
  },
  restore: {
    from: [ReviewStatus.SUSPENDED, ReviewStatus.REMOVED],
    to: ReviewStatus.PUBLISHED,
    type: ModerationActionType.RESTORE,
  },
  investigate: {
    from: [ReviewStatus.PENDING, ReviewStatus.PUBLISHED],
    to: ReviewStatus.UNDER_INVESTIGATION,
    type: ModerationActionType.MARK_UNDER_INVESTIGATION,
  },
  clear_investigation: {
    from: [ReviewStatus.UNDER_INVESTIGATION],
    to: ReviewStatus.PUBLISHED,
    type: ModerationActionType.CLEAR_INVESTIGATION,
  },
};
const TAKEDOWN: ReviewAction[] = ['suspend', 'remove'];
const ACTIVE_DISPUTE: DisputeStatus[] = [
  DisputeStatus.OPEN,
  DisputeStatus.UNDER_REVIEW,
];

/**
 * PRD v2.5 §8.2–§8.4. Every decision has a recorded reason (ModerationAction + audit log with
 * before/after). A review is never removed just because a business disagrees: a take-down needs a
 * policy reason other than NO_VIOLATION. The same standard applies to positive and negative reviews.
 */
@Injectable()
export class ModerationAdminService {
  constructor(
    private prisma: PrismaService,
    private moderation: ModerationService,
    private ratings: RatingsService,
    private notify: NotificationsService,
    private uploads: UploadsService,
    private revalidate: RevalidationService,
  ) {}

  // ──────────────────────────────────────────────────────────────── queues

  async queue(
    q: ReviewQueueQueryDto,
  ): Promise<{ data: QueueItemDto[]; meta: ReturnType<typeof pageMeta> }> {
    const queue = q.queue ?? 'pending';
    const base: Prisma.ReviewWhereInput = { deletedAt: null };
    const where: Prisma.ReviewWhereInput =
      queue === 'pending'
        ? { ...base, status: ReviewStatus.PENDING }
        : queue === 'under_investigation'
          ? {
              ...base,
              OR: [
                { underInvestigation: true },
                { status: ReviewStatus.UNDER_INVESTIGATION },
              ],
            }
          : queue === 'reported'
            ? { reports: { some: { status: ReportStatus.OPEN } } }
            : queue === 'evidence'
              ? {
                  ...base,
                  evidenceAttached: true,
                  evidenceStatus: EvidenceStatus.NOT_REVIEWED,
                }
              : queue === 'suspended'
                ? { status: ReviewStatus.SUSPENDED }
                : { status: ReviewStatus.REMOVED };
    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...skipTake(q.page, q.limit),
        include: {
          business: { select: { id: true, slug: true, name: true } },
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              createdAt: true,
            },
          },
          flags: { select: { type: true, metadata: true, createdAt: true } },
          _count: {
            select: {
              reports: { where: { status: ReportStatus.OPEN } },
              disputes: { where: { status: { in: ACTIVE_DISPUTE } } },
            },
          },
        },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        status: r.status.toLowerCase(),
        overallRating: r.overallRating,
        title: r.title,
        excerpt: excerpt(r.body, 240),
        business: r.business,
        author: r.user,
        flags: r.flags.map((f) => ({ ...f, type: f.type.toLowerCase() })),
        underInvestigation:
          r.underInvestigation || r.status === ReviewStatus.UNDER_INVESTIGATION,
        evidenceAttached: r.evidenceAttached,
        evidenceStatus: r.evidenceStatus.toLowerCase(),
        openReports: r._count.reports,
        activeDisputes: r._count.disputes,
        createdAt: r.createdAt,
      })),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  /** Everything needed to decide, incl. full edit history. Receipt links need evidence.review. */
  async reviewDetail(
    actor: AuthUser,
    id: string,
  ): Promise<{ data: AdminReviewDetailDto }> {
    const r = await this.prisma.review.findUnique({
      where: { id },
      include: {
        business: { select: { id: true, slug: true, name: true } },
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            emailVerified: true,
            createdAt: true,
            suspended: true,
          },
        },
        dimensionRatings: {
          include: { dimension: { select: { key: true, label: true } } },
        },
        evidence: { orderBy: { createdAt: 'asc' } },
        revisions: { orderBy: { createdAt: 'desc' } },
        flags: true,
        reports: {
          orderBy: { createdAt: 'desc' },
          include: { reporter: { select: { username: true } } },
        },
        disputes: { orderBy: { createdAt: 'desc' } },
        response: {
          include: {
            revisions: { orderBy: { createdAt: 'desc' } },
            author: { select: { username: true, displayName: true } },
          },
        },
        resolutionEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw new NotFoundException('Review not found');
    const canSeeReceipts = actor.permissions.includes(
      PERMISSIONS.EVIDENCE_REVIEW,
    );
    const [history, other] = await Promise.all([
      this.moderation.history(ModerationTarget.REVIEW, id),
      this.prisma.review.count({
        where: { userId: r.userId, id: { not: id } },
      }),
    ]);
    const {
      evidence,
      revisions,
      flags,
      reports,
      disputes,
      response,
      ipHash: _i,
      textHash: _t,
      activeKey: _a,
      ...review
    } = r;
    return {
      data: {
        review: {
          ...review,
          status: r.status.toLowerCase(),
          evidenceStatus: r.evidenceStatus.toLowerCase(),
        },
        evidence: evidence.map((e) => ({
          id: e.id,
          type: e.type.toLowerCase(),
          isPrivate: e.isPrivate,
          viewUrl: !e.isPrivate
            ? e.url
            : canSeeReceipts
              ? this.uploads.privateViewUrl(e.url)
              : null,
          restricted: e.isPrivate && !canSeeReceipts,
          createdAt: e.createdAt,
        })),
        revisions: revisions,
        flags: flags.map((f) => ({ ...f, type: f.type.toLowerCase() })),
        reports: reports.map((x) => ({
          ...x,
          openKey: undefined,
          reasonCode: x.reasonCode.toLowerCase(),
          status: x.status.toLowerCase(),
        })),
        disputes: disputes.map((d) => ({
          ...d,
          openKey: undefined,
          status: d.status.toLowerCase(),
        })),
        response: response,
        moderationHistory: history,
        authorOtherReviews: other,
      },
    };
  }

  private async applyReviewAction(
    db: Db,
    actor: AuthUser,
    reviewId: string,
    action: ReviewAction,
    reason: PolicyReason,
    note: string | undefined,
    links: { reportId?: string; disputeId?: string } = {},
  ) {
    const review = await db.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    const t = TRANSITIONS[action];
    if (!t.from.includes(review.status)) {
      throw new BadRequestException(
        `Cannot ${action.replace('_', ' ')} a review that is ${review.status.toLowerCase()}`,
      );
    }
    if (TAKEDOWN.includes(action) && reason === PolicyReason.NO_VIOLATION) {
      throw new BadRequestException(
        'Suspending or removing a review requires the policy it breaks (PRD §8.2)',
      );
    }
    await db.review.update({
      where: { id: reviewId },
      data: {
        status: t.to,
        ...(t.to === ReviewStatus.PUBLISHED && !review.publishedAt
          ? { publishedAt: new Date() }
          : {}),
      },
    });
    await this.moderation.record(
      actor,
      {
        targetType: ModerationTarget.REVIEW,
        targetId: reviewId,
        action: t.type,
        reason,
        note,
        reportId: links.reportId,
        disputeId: links.disputeId,
        before: { status: review.status },
        after: { status: t.to },
        metadata: { businessId: review.businessId },
      },
      db,
    );
    await this.ratings.recompute(review.businessId, db);
    return { review, to: t.to };
  }

  async moderateReview(
    actor: AuthUser,
    id: string,
    dto: ModerateReviewDto,
  ): Promise<{ data: ModerationResultDto }> {
    const { review, to } = await this.prisma.$transaction((tx) =>
      this.applyReviewAction(tx, actor, id, dto.action, dto.reason, dto.note),
    );
    void this.revalidate.business(review.businessId);
    return { data: { id, status: to.toLowerCase() } };
  }

  /** Redact content (e.g. personal information). The previous version is kept as a revision. */
  async editReviewContent(
    actor: AuthUser,
    id: string,
    dto: EditReviewContentDto,
    db?: Db,
    links: { disputeId?: string } = {},
  ) {
    if (dto.title === undefined && dto.body === undefined)
      throw new BadRequestException('Send title and/or body');
    const run = async (tx: Db) => {
      const r = await tx.review.findUnique({
        where: { id },
        include: { dimensionRatings: { include: { dimension: true } } },
      });
      if (!r) throw new NotFoundException('Review not found');
      await tx.reviewRevision.create({
        data: {
          reviewId: id,
          snapshot: {
            overallRating: r.overallRating,
            title: r.title,
            body: r.body,
            recommend: r.recommend,
            dimensions: r.dimensionRatings.map((d) => ({
              key: d.dimension.key,
              value: d.value,
            })),
            editedBy: 'staff',
          },
        },
      });
      const after = await tx.review.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: cleanText(dto.title) } : {}),
          ...(dto.body !== undefined ? { body: cleanText(dto.body) } : {}),
          editedAt: new Date(),
        },
      });
      await this.moderation.record(
        actor,
        {
          targetType: ModerationTarget.REVIEW,
          targetId: id,
          action: ModerationActionType.EDIT,
          reason: dto.reason,
          note: dto.note,
          disputeId: links.disputeId,
          before: { title: r.title, body: r.body },
          after: { title: after.title, body: after.body },
        },
        tx,
      );
      return r.businessId;
    };
    const businessId = db ? await run(db) : await this.prisma.$transaction(run);
    void this.revalidate.business(businessId);
    return { data: { id, status: 'edited' } };
  }

  /** PRD §6.4: evidenceStatus changes only by a moderator action, and every change is audit-logged. */
  async setEvidenceStatus(
    actor: AuthUser,
    reviewId: string,
    dto: EvidenceStatusDto,
  ): Promise<{ data: ModerationResultDto }> {
    const r = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!r) throw new NotFoundException('Review not found');
    if (!r.evidenceAttached)
      throw new BadRequestException('This review has no evidence attached');
    const status =
      dto.status === 'accepted'
        ? EvidenceStatus.ACCEPTED
        : EvidenceStatus.REJECTED;
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: reviewId },
        data: { evidenceStatus: status },
      });
      await tx.reviewEvidence.updateMany({
        where: { reviewId },
        data: { reviewedById: actor.id, reviewedAt: new Date() },
      });
      await this.moderation.record(
        actor,
        {
          targetType: ModerationTarget.REVIEW,
          targetId: reviewId,
          action:
            status === EvidenceStatus.ACCEPTED
              ? ModerationActionType.ACCEPT_EVIDENCE
              : ModerationActionType.REJECT_EVIDENCE,
          reason:
            status === EvidenceStatus.ACCEPTED
              ? PolicyReason.NO_VIOLATION
              : PolicyReason.FAKE_EVIDENCE,
          note: dto.reason,
          before: { evidenceStatus: r.evidenceStatus },
          after: { evidenceStatus: status },
        },
        tx,
      );
    });
    void this.revalidate.business(r.businessId);
    return { data: { id: reviewId, status: status.toLowerCase() } };
  }

  private async removeResponseTx(
    tx: Db,
    actor: AuthUser,
    responseId: string,
    reason: PolicyReason,
    note?: string,
    reportId?: string,
  ) {
    const resp = await tx.businessResponse.findUnique({
      where: { id: responseId },
    });
    if (!resp) throw new NotFoundException('Response not found');
    if (resp.status === ResponseStatus.REMOVED)
      throw new ConflictException('Already removed');
    if (reason === PolicyReason.NO_VIOLATION)
      throw new BadRequestException(
        'Removing a response requires the policy it breaks',
      );
    await tx.businessResponse.update({
      where: { id: responseId },
      data: { status: ResponseStatus.REMOVED },
    });
    await this.moderation.record(
      actor,
      {
        targetType: ModerationTarget.BUSINESS_RESPONSE,
        targetId: resp.reviewId,
        action: ModerationActionType.REMOVE,
        reason,
        note,
        reportId,
        before: { responseStatus: ResponseStatus.PUBLISHED },
        after: { responseStatus: ResponseStatus.REMOVED },
        metadata: { responseId, businessId: resp.businessId },
      },
      tx,
    );
    return resp;
  }

  async removeResponse(
    actor: AuthUser,
    responseId: string,
    dto: RemoveResponseDto,
  ): Promise<{ data: ModerationResultDto }> {
    const resp = await this.prisma.$transaction((tx) =>
      this.removeResponseTx(tx, actor, responseId, dto.reason, dto.note),
    );
    void this.revalidate.business(resp.businessId);
    return { data: { id: responseId, status: 'removed' } };
  }

  // ─────────────────────────────────────────────────────────────── reports

  async reports(
    status: string | undefined,
    page: number,
    limit: number,
  ): Promise<{ data: AdminReportDto[]; meta: ReturnType<typeof pageMeta> }> {
    const where: Prisma.ReviewReportWhereInput = {
      status: status
        ? (status.toUpperCase() as ReportStatus)
        : ReportStatus.OPEN,
    };
    const [total, rows] = await Promise.all([
      this.prisma.reviewReport.count({ where }),
      this.prisma.reviewReport.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...skipTake(page, limit),
        include: {
          reporter: { select: { id: true, username: true } },
          review: {
            select: {
              id: true,
              title: true,
              overallRating: true,
              status: true,
              business: { select: { slug: true, name: true } },
            },
          },
        },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        target: r.responseId ? 'response' : 'review',
        reviewId: r.reviewId,
        responseId: r.responseId,
        reasonCode: r.reasonCode.toLowerCase(),
        note: r.note,
        status: r.status.toLowerCase(),
        reporterType: r.reporterType.toLowerCase(),
        reporter: r.reporter,
        review: { ...r.review, status: r.review.status.toLowerCase() },
        createdAt: r.createdAt,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  /** Decide a report. Acting on the target closes every open report about the same target. */
  async decideReport(
    actor: AuthUser,
    id: string,
    dto: DecideReportDto,
  ): Promise<{ data: ModerationResultDto }> {
    const report = await this.prisma.reviewReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.OPEN)
      throw new ConflictException('This report was already decided');
    const businessId = (
      await this.prisma.review.findUniqueOrThrow({
        where: { id: report.reviewId },
        select: { businessId: true },
      })
    ).businessId;
    let closed = 0;
    await this.prisma.$transaction(async (tx) => {
      const closeData = {
        openKey: null,
        resolvedById: actor.id,
        resolvedAt: new Date(),
        resolutionNote: dto.note ?? null,
      };
      if (dto.decision === 'dismiss') {
        await tx.reviewReport.update({
          where: { id },
          data: { ...closeData, status: ReportStatus.DISMISSED },
        });
        await this.moderation.record(
          actor,
          {
            targetType: ModerationTarget.REVIEW,
            targetId: report.reviewId,
            action: ModerationActionType.DISMISS_REPORT,
            reason: dto.reason,
            note: dto.note,
            reportId: id,
            before: { reportStatus: 'OPEN' },
            after: { reportStatus: 'DISMISSED' },
          },
          tx,
        );
        closed = 1;
      } else if (report.responseId) {
        if (dto.decision !== 'remove')
          throw new BadRequestException(
            'A reported response can only be dismissed or removed',
          );
        await this.removeResponseTx(
          tx,
          actor,
          report.responseId,
          dto.reason,
          dto.note,
          id,
        );
        closed = (
          await tx.reviewReport.updateMany({
            where: { responseId: report.responseId, status: ReportStatus.OPEN },
            data: { ...closeData, status: ReportStatus.ACTIONED },
          })
        ).count;
      } else {
        await this.applyReviewAction(
          tx,
          actor,
          report.reviewId,
          dto.decision,
          dto.reason,
          dto.note,
          { reportId: id },
        );
        closed = (
          await tx.reviewReport.updateMany({
            where: {
              reviewId: report.reviewId,
              responseId: null,
              status: ReportStatus.OPEN,
            },
            data: { ...closeData, status: ReportStatus.ACTIONED },
          })
        ).count;
      }
      await refreshUnderInvestigation(tx, report.reviewId);
    });
    void this.revalidate.business(businessId);
    return {
      data: {
        id,
        status: dto.decision === 'dismiss' ? 'dismissed' : 'actioned',
        reportsClosed: closed,
      },
    };
  }

  // ────────────────────────────────────────────────────────────── disputes

  private presentDispute(
    d: Prisma.BusinessDisputeGetPayload<{
      include: {
        business: { select: { id: true; slug: true; name: true } };
        review: {
          select: { id: true; title: true; overallRating: true; status: true };
        };
        openedBy: { select: { username: true; displayName: true } };
      };
    }>,
  ): AdminDisputeDto {
    return {
      id: d.id,
      status: d.status.toLowerCase(),
      reason: d.reason,
      decision: d.decision,
      business: d.business,
      review: { ...d.review, status: d.review.status.toLowerCase() },
      openedBy: d.openedBy,
      createdAt: d.createdAt,
      decidedAt: d.decidedAt,
    };
  }

  private disputeInclude = {
    business: { select: { id: true, slug: true, name: true } },
    review: {
      select: { id: true, title: true, overallRating: true, status: true },
    },
    openedBy: { select: { username: true, displayName: true } },
  } as const;

  async disputes(
    status: string | undefined,
    page: number,
    limit: number,
  ): Promise<{ data: AdminDisputeDto[]; meta: ReturnType<typeof pageMeta> }> {
    const where: Prisma.BusinessDisputeWhereInput =
      !status || status === 'active'
        ? { status: { in: ACTIVE_DISPUTE } }
        : { status: status.toUpperCase() as DisputeStatus };
    const [total, rows] = await Promise.all([
      this.prisma.businessDispute.count({ where }),
      this.prisma.businessDispute.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...skipTake(page, limit),
        include: this.disputeInclude,
      }),
    ]);
    return {
      data: rows.map((d) => this.presentDispute(d)),
      meta: pageMeta(page, limit, total),
    };
  }

  async disputeDetail(
    actor: AuthUser,
    id: string,
  ): Promise<{ data: AdminDisputeDetailDto }> {
    const d = await this.prisma.businessDispute.findUnique({
      where: { id },
      include: this.disputeInclude,
    });
    if (!d) throw new NotFoundException('Dispute not found');
    const detail = await this.reviewDetail(actor, d.reviewId);
    return { data: { ...this.presentDispute(d), reviewDetail: detail.data } };
  }

  /** OPEN → UNDER_REVIEW when a staff member picks it up (acknowledged in the workflow, §8.6). */
  async startDisputeReview(
    actor: AuthUser,
    id: string,
  ): Promise<{ data: ModerationResultDto }> {
    const d = await this.prisma.businessDispute.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Dispute not found');
    if (d.status !== DisputeStatus.OPEN)
      throw new ConflictException(
        'Only an open dispute can be taken under review',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.businessDispute.update({
        where: { id },
        data: { status: DisputeStatus.UNDER_REVIEW },
      });
      await this.moderation.record(
        actor,
        {
          targetType: ModerationTarget.REVIEW,
          targetId: d.reviewId,
          action: ModerationActionType.START_DISPUTE_REVIEW,
          disputeId: id,
          before: { disputeStatus: 'OPEN' },
          after: { disputeStatus: 'UNDER_REVIEW' },
        },
        tx,
      );
    });
    return { data: { id, status: 'under_review' } };
  }

  /**
   * PRD §8.4: record the decision, notify both parties, keep the audit trail. UPHELD = the review
   * stays; REVIEW_ACTIONED = a moderator edited, suspended or removed it; CLOSED = no decision on
   * the review. A defamation allegation alone is never an automatic takedown (§8.2).
   */
  async decideDispute(
    actor: AuthUser,
    id: string,
    dto: DecideDisputeDto,
  ): Promise<{ data: ModerationResultDto }> {
    const d = await this.prisma.businessDispute.findUnique({
      where: { id },
      include: {
        business: { select: { name: true, slug: true } },
        review: { select: { userId: true } },
      },
    });
    if (!d) throw new NotFoundException('Dispute not found');
    if (!ACTIVE_DISPUTE.includes(d.status))
      throw new ConflictException('This dispute was already decided');
    if (dto.decision === 'review_actioned' && !dto.reviewAction)
      throw new BadRequestException(
        'reviewAction is required for review_actioned',
      );
    if (dto.reviewAction === 'edit' && !dto.editedBody)
      throw new BadRequestException(
        'editedBody is required for reviewAction edit',
      );
    const status =
      dto.decision === 'upheld'
        ? DisputeStatus.UPHELD
        : dto.decision === 'review_actioned'
          ? DisputeStatus.REVIEW_ACTIONED
          : DisputeStatus.CLOSED;
    await this.prisma.$transaction(async (tx) => {
      if (dto.decision === 'review_actioned') {
        if (dto.reviewAction === 'edit') {
          await this.editReviewContent(
            actor,
            d.reviewId,
            { body: dto.editedBody, reason: dto.reason, note: dto.note },
            tx,
            { disputeId: id },
          );
        } else {
          await this.applyReviewAction(
            tx,
            actor,
            d.reviewId,
            dto.reviewAction!,
            dto.reason,
            dto.note,
            { disputeId: id },
          );
        }
      }
      await tx.businessDispute.update({
        where: { id },
        data: {
          status,
          openKey: null,
          decision: dto.note,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      await this.moderation.record(
        actor,
        {
          targetType: ModerationTarget.REVIEW,
          targetId: d.reviewId,
          action:
            status === DisputeStatus.UPHELD
              ? ModerationActionType.UPHOLD_REVIEW
              : status === DisputeStatus.REVIEW_ACTIONED
                ? ModerationActionType.ACTION_REVIEW
                : ModerationActionType.CLOSE_DISPUTE,
          reason: dto.reason,
          note: dto.note,
          disputeId: id,
          before: { disputeStatus: d.status },
          after: {
            disputeStatus: status,
            reviewAction: dto.reviewAction ?? null,
          },
        },
        tx,
      );
      await refreshUnderInvestigation(tx, d.reviewId);
    });
    void this.revalidate.business(d.businessId);

    const outcome =
      status === DisputeStatus.UPHELD
        ? 'The review stays published as it is.'
        : status === DisputeStatus.REVIEW_ACTIONED
          ? dto.reviewAction === 'edit'
            ? 'A moderator edited the review.'
            : `The review was ${dto.reviewAction === 'remove' ? 'removed' : 'suspended'}.`
          : 'The dispute was closed without a change to the review.';
    await this.notify.toBusiness(
      d.businessId,
      'dispute.update',
      `Decision on your dispute (${d.business.name})`,
      [outcome, `Decision: ${dto.note}`],
      {
        label: 'View your disputes',
        path: `/dashboard/${d.businessId}/issues`,
      },
    );
    await this.notify.toUser(
      d.review.userId,
      'dispute.update',
      `Update on your review of ${d.business.name}`,
      [
        `TalkGround finished reviewing a dispute about your review of ${d.business.name}. ${outcome}`,
        'If you disagree with this decision, reply to this email to ask for it to be reconsidered.',
      ],
    );
    return { data: { id, status: status.toLowerCase() } };
  }
}
