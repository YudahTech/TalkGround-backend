import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminPermission,
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
import { pageMeta, skipTake } from '../common/pagination';
import { excerpt } from '../common/utils';
import type { AuthUser } from '../common/current-user.decorator';
import type {
  DecideDisputeDto,
  DecideReportDto,
  EvidenceDecisionDto,
  ModerateReviewDto,
  RemoveResponseDto,
  ReviewQueueQueryDto,
} from './admin.dto';

type ReviewAction = ModerateReviewDto['action'];

/** Allowed status transitions for staff review decisions. */
const TRANSITIONS: Record<
  ReviewAction,
  { from: ReviewStatus[]; to: ReviewStatus; type: ModerationActionType }
> = {
  publish: {
    from: [ReviewStatus.PENDING_MODERATION],
    to: ReviewStatus.PUBLISHED,
    type: ModerationActionType.PUBLISH,
  },
  remove: {
    from: [
      ReviewStatus.PENDING_MODERATION,
      ReviewStatus.PUBLISHED,
      ReviewStatus.UNDER_INVESTIGATION,
    ],
    to: ReviewStatus.REMOVED,
    type: ModerationActionType.REMOVE,
  },
  restore: {
    from: [ReviewStatus.REMOVED],
    to: ReviewStatus.PUBLISHED,
    type: ModerationActionType.RESTORE,
  },
  investigate: {
    from: [ReviewStatus.PUBLISHED, ReviewStatus.PENDING_MODERATION],
    to: ReviewStatus.UNDER_INVESTIGATION,
    type: ModerationActionType.MARK_UNDER_INVESTIGATION,
  },
  clear_investigation: {
    from: [ReviewStatus.UNDER_INVESTIGATION],
    to: ReviewStatus.PUBLISHED,
    type: ModerationActionType.CLEAR_INVESTIGATION,
  },
};

const REASON_TEXT: Record<PolicyReason, string> = {
  SPAM: 'spam',
  FABRICATED_REVIEW: 'it appears to describe an experience that did not happen',
  HARASSMENT: 'harassment',
  THREATS: 'threats',
  HATE_SPEECH: 'hate speech',
  IMPERSONATION: 'impersonation',
  PERSONAL_INFORMATION: 'it exposed personal information',
  MANIPULATED_RATINGS: 'rating manipulation',
  FAKE_EVIDENCE: 'the supporting evidence was not genuine',
  CONFLICT_OF_INTEREST: 'a conflict of interest',
  DEFAMATORY_OR_UNLAWFUL: 'potentially unlawful or defamatory content',
  NO_VIOLATION: 'no rule was broken',
  OTHER: 'a breach of our content rules',
};

/**
 * PRD §8.2–§8.4. Every decision cites a policy ground and is stored as a ModerationAction plus
 * an audit entry. Negative reviews are never removed just because a business disagrees: removal
 * needs a policy reason other than NO_VIOLATION.
 */
@Injectable()
export class ModerationAdminService {
  constructor(
    private prisma: PrismaService,
    private moderation: ModerationService,
    private ratings: RatingsService,
    private notify: NotificationsService,
    private uploads: UploadsService,
  ) {}

  // ──────────────────────────────────────────────────────────────── queues

  async queue(q: ReviewQueueQueryDto) {
    const queue = q.queue ?? 'pending_moderation';
    const where: Prisma.ReviewWhereInput =
      queue === 'pending_moderation'
        ? { status: ReviewStatus.PENDING_MODERATION }
        : queue === 'under_investigation'
          ? { status: ReviewStatus.UNDER_INVESTIGATION }
          : queue === 'removed'
            ? { status: ReviewStatus.REMOVED }
            : queue === 'reported'
              ? { reports: { some: { status: ReportStatus.OPEN } } }
              : { evidence: { some: { status: EvidenceStatus.NOT_REVIEWED } } };
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
              evidence: { where: { status: EvidenceStatus.NOT_REVIEWED } },
              disputes: { where: { status: DisputeStatus.OPEN } },
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
        openReports: r._count.reports,
        evidenceToReview: r._count.evidence,
        openDisputes: r._count.disputes,
        createdAt: r.createdAt,
      })),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  /** Everything a moderator needs to decide. Private evidence links require EVIDENCE_REVIEW. */
  async reviewDetail(actor: AuthUser, id: string) {
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
        dimensions: {
          include: { dimension: { select: { key: true, name: true } } },
        },
        evidence: true,
        revisions: { orderBy: { createdAt: 'desc' } },
        flags: true,
        reports: {
          orderBy: { createdAt: 'desc' },
          include: { reporter: { select: { username: true } } },
        },
        disputes: { orderBy: { createdAt: 'desc' } },
        response: {
          include: {
            revisions: true,
            author: { select: { username: true, displayName: true } },
          },
        },
        resolutionEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw new NotFoundException('Review not found');
    const canSeeEvidence = actor.permissions.includes(
      AdminPermission.EVIDENCE_REVIEW,
    );
    const [history, otherReviewsByAuthor] = await Promise.all([
      this.moderation.history(ModerationTarget.REVIEW, id),
      this.prisma.review.count({
        where: { userId: r.userId, id: { not: id } },
      }),
    ]);
    return {
      data: {
        ...r,
        status: r.status.toLowerCase(),
        ipHash: undefined,
        textHash: undefined,
        activeKey: undefined,
        evidence: r.evidence.map((e) => ({
          id: e.id,
          kind: e.kind.toLowerCase(),
          isPrivate: e.isPrivate,
          status: e.status.toLowerCase(),
          reviewNote: e.reviewNote,
          createdAt: e.createdAt,
          viewUrl: !e.isPrivate
            ? e.url
            : canSeeEvidence
              ? this.uploads.privateViewUrl(e.url)
              : null,
          restricted: e.isPrivate && !canSeeEvidence,
        })),
        authorOtherReviews: otherReviewsByAuthor,
        moderationHistory: history,
      },
    };
  }

  async moderateReview(
    actor: AuthUser,
    id: string,
    dto: ModerateReviewDto,
    links: { reportId?: string; disputeId?: string } = {},
  ) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { business: { select: { name: true, slug: true } } },
    });
    if (!review) throw new NotFoundException('Review not found');
    const t = TRANSITIONS[dto.action];
    if (!t.from.includes(review.status)) {
      throw new BadRequestException(
        `Cannot ${dto.action} a review that is ${review.status.toLowerCase()}`,
      );
    }
    if (dto.action === 'remove' && dto.reason === PolicyReason.NO_VIOLATION) {
      throw new BadRequestException(
        'Removing a review requires the policy it breaks (PRD §8.2)',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id },
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
          targetId: id,
          action: t.type,
          reason: dto.reason,
          note: dto.note,
          reportId: links.reportId,
          disputeId: links.disputeId,
          metadata: {
            from: review.status,
            to: t.to,
            businessId: review.businessId,
          },
        },
        tx,
      );
      await this.ratings.recompute(review.businessId, tx);
    });

    if (dto.action === 'remove') {
      await this.notify.toUser(review.userId, 'Your review was removed', [
        `Your review of ${review.business.name} was removed because ${REASON_TEXT[dto.reason]}.`,
        ...(dto.note ? [`Moderator note: ${dto.note}`] : []),
        'If you think this is a mistake, reply to this email to appeal.',
      ]);
    } else if (dto.action === 'publish') {
      await this.notify.toUser(
        review.userId,
        'Your review is live',
        [
          `Your review of ${review.business.name} passed our checks and is now published.`,
        ],
        {
          label: 'View your review',
          path: `/reviews/${id}`,
        },
      );
    }
    return { data: { reviewId: id, status: t.to.toLowerCase() } };
  }

  /** PRD §7.6: "Evidence reviewed" only after this actual examination. */
  async decideEvidence(
    actor: AuthUser,
    evidenceId: string,
    dto: EvidenceDecisionDto,
  ) {
    const ev = await this.prisma.reviewEvidence.findUnique({
      where: { id: evidenceId },
    });
    if (!ev) throw new NotFoundException('Evidence not found');
    const status =
      dto.decision === 'accepted'
        ? EvidenceStatus.ACCEPTED
        : EvidenceStatus.REJECTED;
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewEvidence.update({
        where: { id: evidenceId },
        data: {
          status,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: dto.note ?? null,
        },
      });
      await this.moderation.record(
        actor,
        {
          targetType: ModerationTarget.EVIDENCE,
          targetId: evidenceId,
          action:
            status === EvidenceStatus.ACCEPTED
              ? ModerationActionType.ACCEPT_EVIDENCE
              : ModerationActionType.REJECT_EVIDENCE,
          reason:
            status === EvidenceStatus.ACCEPTED
              ? PolicyReason.NO_VIOLATION
              : PolicyReason.FAKE_EVIDENCE,
          note: dto.note,
          metadata: { reviewId: ev.reviewId },
        },
        tx,
      );
    });
    return { data: { evidenceId, status: status.toLowerCase() } };
  }

  async removeResponse(
    actor: AuthUser,
    responseId: string,
    dto: RemoveResponseDto,
  ) {
    const resp = await this.prisma.businessResponse.findUnique({
      where: { id: responseId },
    });
    if (!resp) throw new NotFoundException('Response not found');
    if (resp.status === ResponseStatus.REMOVED)
      throw new ConflictException('Already removed');
    if (dto.reason === PolicyReason.NO_VIOLATION) {
      throw new BadRequestException(
        'Removing a response requires the policy it breaks',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.businessResponse.update({
        where: { id: responseId },
        data: { status: ResponseStatus.REMOVED },
      });
      await this.moderation.record(
        actor,
        {
          targetType: ModerationTarget.BUSINESS_RESPONSE,
          targetId: responseId,
          action: ModerationActionType.REMOVE,
          reason: dto.reason,
          note: dto.note,
          metadata: { reviewId: resp.reviewId, businessId: resp.businessId },
        },
        tx,
      );
    });
    await this.notify.toBusiness(
      resp.businessId,
      'Your response to a review was removed',
      [
        `A response posted by your business was removed because ${REASON_TEXT[dto.reason]}.`,
        ...(dto.note ? [`Moderator note: ${dto.note}`] : []),
      ],
    );
    return { data: { responseId, status: 'removed' } };
  }

  // ─────────────────────────────────────────────────────────────── reports

  async reports(status: string | undefined, page: number, limit: number) {
    const where: Prisma.ReviewReportWhereInput = {
      status: (status?.toUpperCase() as ReportStatus) ?? ReportStatus.OPEN,
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
        ...r,
        reason: r.reason.toLowerCase(),
        status: r.status.toLowerCase(),
        reporterType: r.reporterType.toLowerCase(),
        openKey: undefined,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async decideReport(actor: AuthUser, id: string, dto: DecideReportDto) {
    const report = await this.prisma.reviewReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.OPEN)
      throw new ConflictException('This report was already decided');

    if (dto.decision === 'dismiss') {
      await this.prisma.$transaction(async (tx) => {
        await tx.reviewReport.update({
          where: { id },
          data: {
            status: ReportStatus.DISMISSED,
            openKey: null,
            resolvedById: actor.id,
            resolvedAt: new Date(),
            resolutionNote: dto.note ?? null,
          },
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
          },
          tx,
        );
      });
      return { data: { reportId: id, status: 'dismissed' } };
    }

    await this.moderateReview(
      actor,
      report.reviewId,
      {
        action: dto.decision === 'remove_review' ? 'remove' : 'investigate',
        reason: dto.reason,
        note: dto.note,
      },
      { reportId: id },
    );
    // Acting on the review settles every open report against it.
    const closed = await this.prisma.reviewReport.updateMany({
      where: { reviewId: report.reviewId, status: ReportStatus.OPEN },
      data: {
        status: ReportStatus.ACTIONED,
        openKey: null,
        resolvedById: actor.id,
        resolvedAt: new Date(),
        resolutionNote: dto.note ?? null,
      },
    });
    return {
      data: { reportId: id, status: 'actioned', reportsClosed: closed.count },
    };
  }

  // ────────────────────────────────────────────────────────────── disputes

  async disputes(status: string | undefined, page: number, limit: number) {
    const where: Prisma.BusinessDisputeWhereInput = {
      status: (status?.toUpperCase() as DisputeStatus) ?? DisputeStatus.OPEN,
    };
    const [total, rows] = await Promise.all([
      this.prisma.businessDispute.count({ where }),
      this.prisma.businessDispute.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...skipTake(page, limit),
        include: {
          business: { select: { id: true, slug: true, name: true } },
          review: {
            select: {
              id: true,
              title: true,
              overallRating: true,
              status: true,
            },
          },
          raisedBy: { select: { username: true, displayName: true } },
        },
      }),
    ]);
    return {
      data: rows.map((d) => ({
        ...d,
        reason: d.reason.toLowerCase(),
        status: d.status.toLowerCase(),
        openKey: undefined,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async disputeDetail(actor: AuthUser, id: string) {
    const d = await this.prisma.businessDispute.findUnique({
      where: { id },
      include: {
        business: {
          select: { id: true, slug: true, name: true, ownershipStatus: true },
        },
        raisedBy: {
          select: { id: true, username: true, displayName: true, email: true },
        },
      },
    });
    if (!d) throw new NotFoundException('Dispute not found');
    const review = await this.reviewDetail(actor, d.reviewId);
    return {
      data: {
        ...d,
        reason: d.reason.toLowerCase(),
        status: d.status.toLowerCase(),
        openKey: undefined,
        review: review.data,
        history: await this.moderation.history(
          ModerationTarget.REVIEW,
          d.reviewId,
        ),
      },
    };
  }

  /**
   * PRD §8.4: examine, record the decision, notify both parties, keep the audit trail.
   * The review itself is only changed through the normal moderation transitions.
   */
  async decideDispute(actor: AuthUser, id: string, dto: DecideDisputeDto) {
    const d = await this.prisma.businessDispute.findUnique({
      where: { id },
      include: {
        business: { select: { name: true } },
        review: { select: { userId: true } },
      },
    });
    if (!d) throw new NotFoundException('Dispute not found');
    if (d.status !== DisputeStatus.OPEN)
      throw new ConflictException('This dispute was already decided');
    if (dto.decision === 'uphold' && !dto.reviewAction) {
      throw new BadRequestException(
        'reviewAction is required when upholding a dispute',
      );
    }
    if (dto.decision === 'uphold') {
      await this.moderateReview(
        actor,
        d.reviewId,
        {
          action: dto.reviewAction === 'remove' ? 'remove' : 'investigate',
          reason: dto.reason,
          note: dto.note,
        },
        { disputeId: id },
      );
    }
    const status =
      dto.decision === 'uphold' ? DisputeStatus.UPHELD : DisputeStatus.REJECTED;
    await this.prisma.$transaction(async (tx) => {
      await tx.businessDispute.update({
        where: { id },
        data: {
          status,
          openKey: null,
          decisionNote: dto.note,
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
            dto.decision === 'uphold'
              ? ModerationActionType.UPHOLD_DISPUTE
              : ModerationActionType.REJECT_DISPUTE,
          reason: dto.reason,
          note: dto.note,
          disputeId: id,
        },
        tx,
      );
    });

    await this.notify.toBusiness(
      d.businessId,
      `Decision on your dispute (${d.business.name})`,
      [
        dto.decision === 'uphold'
          ? `We upheld your dispute. The review ${dto.reviewAction === 'remove' ? 'was removed' : 'is now marked as under investigation'}.`
          : 'We examined the review against our rules and the available evidence and it stays published.',
        `Decision note: ${dto.note}`,
      ],
    );
    if (dto.decision === 'uphold' && dto.reviewAction === 'investigate') {
      await this.notify.toUser(
        d.review.userId,
        'Your review is under investigation',
        [
          `${d.business.name} disputed your review and we are looking into it. It stays visible with an "Under investigation" label.`,
          'You can strengthen your review by attaching supporting evidence (e.g. a receipt).',
        ],
        { label: 'View your review', path: `/reviews/${d.reviewId}` },
      );
    }
    return { data: { disputeId: id, status: status.toLowerCase() } };
  }
}
