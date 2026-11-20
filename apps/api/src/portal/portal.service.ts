import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  DisputeStatus,
  IdentifierType,
  Prisma,
  ResolutionStatus,
  ResponseStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessAccessService } from '../businesses/business-access.service';
import { BusinessWriterService } from '../businesses/business-writer.service';
import { BusinessesService } from '../businesses/businesses.service';
import { RatingsService } from '../businesses/ratings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { lifecycleStage, ownershipBadge } from '../businesses/lifecycle';
import { PUBLIC_REVIEW_STATUSES, roundRating } from '../common/rating-rules';
import { normalizeNigerianPhone } from '../common/identifiers';
import { cleanText } from '../common/utils';
import { pageMeta, skipTake } from '../common/pagination';
import type { AuthUser } from '../common/current-user.decorator';
import type {
  IdentifierInputDto,
  ManageBusinessDto,
} from '../businesses/businesses.dto';
import {
  PUBLIC_REVIEW_INCLUDE,
  RESOLUTION_LABELS,
  presentReview,
} from '../reviews/review-presenter';
import type {
  CreateDisputeDto,
  PortalReviewQueryDto,
  ProposeResolutionDto,
} from './portal.dto';

/** Reviews of 1–2 stars are treated as complaints for the dashboard (PRD §7.10 "unresolved complaints"). */
const COMPLAINT_MAX_RATING = 2;
const MAX_RESPONSE_EDITS = 3;
/** Identifier types an owner may add/remove as "public business links" (PRD §7.10). */
const OWNER_EDITABLE_IDENTIFIERS: IdentifierType[] = [
  IdentifierType.INSTAGRAM,
  IdentifierType.TIKTOK,
  IdentifierType.FACEBOOK,
  IdentifierType.X,
  IdentifierType.WHATSAPP,
  IdentifierType.WEBSITE,
  IdentifierType.PHONE,
  IdentifierType.EMAIL,
];

/** PRD §7.10 business dashboard, §7.7 responses, §7.8 resolution, §7.11 sharing, §8.4 disputes. */
@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private access: BusinessAccessService,
    private writer: BusinessWriterService,
    private businesses: BusinessesService,
    private ratings: RatingsService,
    private notify: NotificationsService,
    private audit: AuditService,
  ) {}

  private actor(user: AuthUser) {
    return { id: user.id, role: 'business_representative' };
  }

  /** The review must belong to the business the caller manages. */
  private async reviewOf(businessId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        response: true,
        business: { select: { name: true, slug: true } },
      },
    });
    if (!review || review.businessId !== businessId) {
      throw new NotFoundException('Review not found for this business');
    }
    if (!PUBLIC_REVIEW_STATUSES.includes(review.status)) {
      throw new BadRequestException('Only published reviews can be acted on');
    }
    return review;
  }

  // ───────────────────────────────────────────────────────────── businesses

  async myBusinesses(userId: string) {
    const rows = await this.prisma.businessMember.findMany({
      where: { userId, revokedAt: null },
      include: {
        business: {
          include: { category: { select: { slug: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      data: rows.map((m) => ({
        role: m.role.toLowerCase(),
        since: m.createdAt,
        business: {
          id: m.business.id,
          slug: m.business.slug,
          name: m.business.name,
          logoUrl: m.business.logoUrl,
          category: m.business.category,
          status: m.business.status.toLowerCase(),
          lifecycleStage: lifecycleStage(m.business),
          ownership: ownershipBadge(m.business.ownershipStatus),
          rating: this.ratings.compact(m.business),
        },
      })),
    };
  }

  async managementView(user: AuthUser, businessId: string) {
    const b = await this.access.assertManager(user.id, businessId);
    const full = await this.prisma.business.findUniqueOrThrow({
      where: { id: b.id },
      include: {
        category: { select: { slug: true, name: true } },
        identifiers: { orderBy: { createdAt: 'asc' } },
        locations: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      },
    });
    return {
      data: {
        id: full.id,
        slug: full.slug,
        name: full.name,
        description: full.description,
        logoUrl: full.logoUrl,
        website: full.website,
        publicEmail: full.publicEmail,
        publicPhone: full.publicPhone,
        category: full.category,
        status: full.status.toLowerCase(),
        lifecycleStage: lifecycleStage(full),
        ownership: ownershipBadge(full.ownershipStatus),
        identifiers: full.identifiers.map((i) => ({
          id: i.id,
          type: i.type.toLowerCase(),
          value: i.value,
          normalizedValue: i.normalizedValue,
          editableByOwner: OWNER_EDITABLE_IDENTIFIERS.includes(i.type),
        })),
        locations: full.locations.map((l) =>
          this.businesses.presentLocation(l),
        ),
        editableFields: [
          'description',
          'logoUrl',
          'website',
          'publicEmail',
          'publicPhone',
          'locations',
          'identifiers (social links, website, phone, email)',
        ],
        lockedFields: {
          fields: ['name', 'category'],
          reason:
            'Name and category changes are made by TalkGround staff so a business cannot rebrand away from its reviews. Contact support.',
        },
      },
    };
  }

  async updateProfile(
    user: AuthUser,
    businessId: string,
    dto: ManageBusinessDto,
  ) {
    await this.access.assertManager(user.id, businessId);
    if (dto.publicPhone && !normalizeNigerianPhone(dto.publicPhone)) {
      throw new BadRequestException(
        'publicPhone must be a Nigerian phone number',
      );
    }
    if (
      dto.logoUrl &&
      !/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/.*talkground\/logos\//.test(
        dto.logoUrl,
      )
    ) {
      throw new BadRequestException(
        'Upload the logo with POST /uploads/signature (folder "logos") first',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.writer.syncProfileIdentifiers(businessId, dto, tx);
      await tx.business.update({
        where: { id: businessId },
        data: {
          ...(dto.description !== undefined
            ? {
                description: dto.description
                  ? cleanText(dto.description)
                  : null,
              }
            : {}),
          ...(dto.logoUrl !== undefined
            ? { logoUrl: dto.logoUrl || null }
            : {}),
          ...(dto.website !== undefined
            ? { website: dto.website || null }
            : {}),
          ...(dto.publicEmail !== undefined
            ? { publicEmail: dto.publicEmail?.toLowerCase() || null }
            : {}),
          ...(dto.publicPhone !== undefined
            ? {
                publicPhone: dto.publicPhone
                  ? normalizeNigerianPhone(dto.publicPhone)
                  : null,
              }
            : {}),
        },
      });
      if (dto.locations)
        await this.writer.replaceLocations(businessId, dto.locations, tx);
      await this.writer.rebuildSearchText(businessId, tx);
      await this.audit.record(
        this.actor(user),
        {
          action: 'business.profile_update_by_owner',
          targetType: 'business',
          targetId: businessId,
          metadata: { fields: Object.keys(dto) },
        },
        tx,
      );
    });
    return this.managementView(user, businessId);
  }

  async addIdentifier(
    user: AuthUser,
    businessId: string,
    dto: IdentifierInputDto,
  ) {
    await this.access.assertManager(user.id, businessId);
    if (!OWNER_EDITABLE_IDENTIFIERS.includes(dto.type)) {
      throw new ForbiddenException(
        'Only staff can add this type of identifier',
      );
    }
    const created = await this.writer.addIdentifier(businessId, dto);
    return {
      data: {
        id: created.id,
        type: created.type.toLowerCase(),
        value: created.value,
      },
    };
  }

  async removeIdentifier(
    user: AuthUser,
    businessId: string,
    identifierId: string,
  ) {
    await this.access.assertManager(user.id, businessId);
    const ident = await this.prisma.businessIdentifier.findFirst({
      where: { id: identifierId, businessId },
    });
    if (!ident) throw new NotFoundException('Identifier not found');
    if (!OWNER_EDITABLE_IDENTIFIERS.includes(ident.type)) {
      throw new ForbiddenException('Only staff can remove this identifier');
    }
    await this.writer.removeIdentifier(businessId, identifierId);
    return { data: { message: 'Removed' } };
  }

  // ─────────────────────────────────────────────────────────────── dashboard

  async dashboard(user: AuthUser, businessId: string) {
    const b = await this.access.assertManager(user.id, businessId);
    const publicWhere: Prisma.ReviewWhereInput = {
      businessId,
      status: { in: PUBLIC_REVIEW_STATUSES },
    };
    const complaintWhere: Prisma.ReviewWhereInput = {
      ...publicWhere,
      supersededAt: null,
      overallRating: { lte: COMPLAINT_MAX_RATING },
      resolutionStatus: { not: ResolutionStatus.RESOLVED_BY_CONSUMER },
    };
    const [
      dimensions,
      recent,
      publicCount,
      responded,
      responseTimes,
      unresolvedCount,
      unresolved,
      trends,
      openReports,
      openDisputes,
    ] = await Promise.all([
      this.ratings.dimensionBreakdown(b.id, b.categoryId),
      this.prisma.review.findMany({
        where: publicWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: PUBLIC_REVIEW_INCLUDE,
      }),
      this.prisma.review.count({ where: publicWhere }),
      this.prisma.review.count({
        where: {
          ...publicWhere,
          response: { status: ResponseStatus.PUBLISHED },
        },
      }),
      this.prisma.$queryRaw<{ hours: number | null }[]>`
        SELECT avg(extract(epoch FROM (resp."createdAt" - coalesce(r."publishedAt", r."createdAt"))) / 3600)::float AS hours
        FROM "BusinessResponse" resp JOIN "Review" r ON r.id = resp."reviewId"
        WHERE resp."businessId" = ${businessId} AND resp.status = 'PUBLISHED'`,
      this.prisma.review.count({ where: complaintWhere }),
      this.prisma.review.findMany({
        where: complaintWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: PUBLIC_REVIEW_INCLUDE,
      }),
      this.prisma.$queryRaw<
        { month: Date; reviews: bigint; average: number | null }[]
      >`
        SELECT date_trunc('month', r."createdAt") AS month, count(*)::bigint AS reviews, avg(r."overallRating")::float AS average
        FROM "Review" r
        WHERE r."businessId" = ${businessId}
          AND r.status IN ('PUBLISHED', 'UNDER_INVESTIGATION')
          AND r."createdAt" >= date_trunc('month', now()) - interval '5 months'
        GROUP BY 1 ORDER BY 1`,
      this.prisma.reviewReport.count({ where: { businessId, status: 'OPEN' } }),
      this.prisma.businessDispute.count({
        where: { businessId, status: DisputeStatus.OPEN },
      }),
    ]);

    const byMonth = new Map(
      trends.map((t) => [t.month.toISOString().slice(0, 7), t]),
    );
    const months: {
      month: string;
      reviews: number;
      averageRating: number | null;
    }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
      );
      const key = d.toISOString().slice(0, 7);
      const t = byMonth.get(key);
      months.push({
        month: key,
        reviews: Number(t?.reviews ?? 0),
        averageRating: roundRating(t?.average ?? null),
      });
    }

    return {
      data: {
        business: {
          id: b.id,
          slug: b.slug,
          name: b.name,
          ownership: ownershipBadge(b.ownershipStatus),
        },
        overview: {
          rating: this.ratings.summary(b),
          dimensions,
          publishedReviews: publicCount,
          countedInRating: b.reviewCount,
        },
        responseActivity: {
          responded,
          unanswered: publicCount - responded,
          responseRate: publicCount
            ? Math.round((responded / publicCount) * 100)
            : null,
          averageResponseHours:
            responseTimes[0]?.hours != null
              ? Math.round(responseTimes[0].hours * 10) / 10
              : null,
        },
        unresolvedComplaints: {
          count: unresolvedCount,
          definition: `Reviews of ${COMPLAINT_MAX_RATING} stars or fewer that the reviewer has not reported as resolved`,
          recent: unresolved.map((r) => presentReview(r)),
        },
        trends: { monthly: months },
        reportedIssues: { openReports, openDisputes },
        recentReviews: recent.map((r) => presentReview(r)),
        shareLinks: this.shareLinksFor(b),
      },
    };
  }

  async reviews(user: AuthUser, businessId: string, q: PortalReviewQueryDto) {
    await this.access.assertManager(user.id, businessId);
    const where: Prisma.ReviewWhereInput = {
      businessId,
      status: { in: PUBLIC_REVIEW_STATUSES },
    };
    if (q.filter === 'unanswered') where.response = null;
    if (q.filter === 'complaints' || q.filter === 'unresolved')
      where.overallRating = { lte: COMPLAINT_MAX_RATING };
    if (q.filter === 'unresolved')
      where.resolutionStatus = { not: ResolutionStatus.RESOLVED_BY_CONSUMER };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.limit),
        include: {
          ...PUBLIC_REVIEW_INCLUDE,
          disputes: {
            where: { status: DisputeStatus.OPEN },
            select: { id: true },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        ...presentReview(r),
        canRespond: !r.response,
        canEditResponse:
          !!r.response &&
          r.response.status === ResponseStatus.PUBLISHED &&
          r.response.editCount < MAX_RESPONSE_EDITS,
        hasOpenDispute: r.disputes.length > 0,
      })),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  // ─────────────────────────────────────────────────────────────── sharing

  private shareLinksFor(b: { slug: string; name: string }) {
    const base = this.notify.frontendUrl();
    const profileUrl = `${base}/businesses/${b.slug}`;
    const reviewUrl = `${base}/businesses/${b.slug}/review`;
    return {
      profileUrl,
      reviewUrl,
      suggestedMessage: `We'd value your honest feedback about your experience with ${b.name}. You can share it on TalkGround: ${reviewUrl}`,
      whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(`Share your honest experience with ${b.name} on TalkGround: ${reviewUrl}`)}`,
      policy:
        'Invite every customer, not only happy ones, and never offer rewards for positive reviews. Selective or incentivised invitations break TalkGround rules (PRD §7.11).',
    };
  }

  async shareLinks(user: AuthUser, businessId: string) {
    const b = await this.access.assertManager(user.id, businessId);
    await this.audit.record(this.actor(user), {
      action: 'business.share_links_view',
      targetType: 'business',
      targetId: businessId,
    });
    return { data: this.shareLinksFor(b) };
  }

  // ───────────────────────────────────────────────────────────── responses

  /** PRD §7.7: one official response per review, from an authorised representative. */
  async respond(
    user: AuthUser,
    businessId: string,
    reviewId: string,
    body: string,
  ) {
    await this.access.assertManager(user.id, businessId);
    const review = await this.reviewOf(businessId, reviewId);
    if (review.response) {
      throw new ConflictException(
        'This review already has an official response. Edit it instead.',
      );
    }
    const response = await this.prisma.$transaction(async (tx) => {
      const created = await tx.businessResponse.create({
        data: {
          reviewId,
          businessId,
          authorId: user.id,
          body: cleanText(body),
        },
      });
      if (review.resolutionStatus === ResolutionStatus.NONE) {
        await tx.review.update({
          where: { id: reviewId },
          data: { resolutionStatus: ResolutionStatus.BUSINESS_RESPONDED },
        });
        await tx.resolutionEvent.create({
          data: {
            reviewId,
            status: ResolutionStatus.BUSINESS_RESPONDED,
            actorType: ActorType.SYSTEM,
          },
        });
      }
      return created;
    });
    await this.notify.toUser(
      review.userId,
      `${review.business.name} responded to your review`,
      [
        `${review.business.name} posted an official response to your review on TalkGround.`,
      ],
      { label: 'Read the response', path: `/reviews/${reviewId}` },
    );
    return {
      data: {
        id: response.id,
        body: response.body,
        createdAt: response.createdAt,
      },
    };
  }

  /** Controlled editing: limited edits, every previous version kept. */
  async editResponse(
    user: AuthUser,
    businessId: string,
    reviewId: string,
    body: string,
  ) {
    await this.access.assertManager(user.id, businessId);
    await this.reviewOf(businessId, reviewId);
    const response = await this.prisma.businessResponse.findUnique({
      where: { reviewId },
    });
    if (!response || response.businessId !== businessId)
      throw new NotFoundException('No response to edit');
    if (response.status !== ResponseStatus.PUBLISHED) {
      throw new ForbiddenException('This response was removed by moderators');
    }
    if (response.editCount >= MAX_RESPONSE_EDITS) {
      throw new ForbiddenException(
        `Responses can be edited at most ${MAX_RESPONSE_EDITS} times`,
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.responseRevision.create({
        data: { responseId: response.id, body: response.body },
      });
      return tx.businessResponse.update({
        where: { id: response.id },
        data: {
          body: cleanText(body),
          editCount: { increment: 1 },
          editedAt: new Date(),
        },
      });
    });
    return {
      data: {
        id: updated.id,
        body: updated.body,
        editedAt: updated.editedAt,
        editsRemaining: MAX_RESPONSE_EDITS - updated.editCount,
      },
    };
  }

  /** PRD §7.8: a business may PROPOSE a resolution; only the consumer can report it resolved. */
  async proposeResolution(
    user: AuthUser,
    businessId: string,
    reviewId: string,
    dto: ProposeResolutionDto,
  ) {
    await this.access.assertManager(user.id, businessId);
    const review = await this.reviewOf(businessId, reviewId);
    if (review.resolutionStatus === ResolutionStatus.RESOLVED_BY_CONSUMER) {
      throw new BadRequestException(
        'The reviewer already reported this resolved',
      );
    }
    await this.prisma.$transaction([
      this.prisma.review.update({
        where: { id: reviewId },
        data: { resolutionStatus: ResolutionStatus.RESOLUTION_PROPOSED },
      }),
      this.prisma.resolutionEvent.create({
        data: {
          reviewId,
          status: ResolutionStatus.RESOLUTION_PROPOSED,
          actorType: ActorType.BUSINESS,
          actorId: user.id,
          note: cleanText(dto.note),
        },
      }),
    ]);
    await this.notify.toUser(
      review.userId,
      `${review.business.name} proposed a resolution`,
      [
        `${review.business.name} says they have proposed a resolution to the issue in your review: "${cleanText(dto.note)}"`,
        'If the issue is resolved, you can report it resolved on your review. If not, you can say so. Your rating does not change either way.',
      ],
      { label: 'View your review', path: `/reviews/${reviewId}` },
    );
    return {
      data: {
        status: 'resolution_proposed',
        label: RESOLUTION_LABELS.RESOLUTION_PROPOSED,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────── disputes

  /** PRD §8.4: the business challenges a review. The review stays exactly as it is. */
  async dispute(
    user: AuthUser,
    businessId: string,
    reviewId: string,
    dto: CreateDisputeDto,
  ) {
    await this.access.assertManager(user.id, businessId);
    await this.reviewOf(businessId, reviewId);
    try {
      const d = await this.prisma.businessDispute.create({
        data: {
          reviewId,
          businessId,
          raisedById: user.id,
          reason: dto.reason,
          details: cleanText(dto.details),
          openKey: reviewId,
        },
      });
      await this.audit.record(this.actor(user), {
        action: 'dispute.open',
        targetType: 'dispute',
        targetId: d.id,
        metadata: { reviewId, businessId },
      });
      return {
        data: {
          id: d.id,
          status: 'open',
          message:
            'Our moderators will examine the review against our rules and the available evidence. The review stays visible meanwhile.',
        },
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'There is already an open dispute on this review',
        );
      }
      throw err;
    }
  }

  /** "View reported issues" (PRD §7.10): the business's own reports and disputes with outcomes. */
  async issues(user: AuthUser, businessId: string) {
    await this.access.assertManager(user.id, businessId);
    const [disputes, reports] = await Promise.all([
      this.prisma.businessDispute.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          review: {
            select: {
              id: true,
              title: true,
              overallRating: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.reviewReport.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          review: {
            select: {
              id: true,
              title: true,
              overallRating: true,
              status: true,
            },
          },
        },
      }),
    ]);
    return {
      data: {
        disputes: disputes.map((d) => ({
          id: d.id,
          reason: d.reason.toLowerCase(),
          details: d.details,
          status: d.status.toLowerCase(),
          decisionNote: d.decisionNote,
          decidedAt: d.decidedAt,
          createdAt: d.createdAt,
          review: { ...d.review, status: d.review.status.toLowerCase() },
        })),
        reports: reports.map((r) => ({
          id: r.id,
          reason: r.reason.toLowerCase(),
          status: r.status.toLowerCase(),
          resolutionNote: r.resolutionNote,
          createdAt: r.createdAt,
          review: { ...r.review, status: r.review.status.toLowerCase() },
        })),
      },
    };
  }
}
