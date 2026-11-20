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
import { RatingsService } from '../businesses/ratings.service';
import { SeoService } from '../businesses/seo.service';
import { presentLocation } from '../businesses/businesses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { AppConfig } from '../common/app-config';
import { ownershipBadge } from '../businesses/lifecycle';
import {
  RATED_REVIEW_WHERE,
  VISIBLE_REVIEW_WHERE,
  roundRating,
} from '../common/rating-rules';
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
import { refreshUnderInvestigation } from '../reviews/investigation';
import type {
  CreateDisputeDto,
  PortalReviewQueryDto,
  ProposeResolutionDto,
} from './portal.dto';
import type {
  DashboardDto,
  DisputeCreatedDto,
  IssuesDto,
  ManagementViewDto,
  MyBusinessDto,
  OwnResponseDto,
  PortalReviewDto,
  ShareLinksDto,
} from './portal.responses';

/** 1–2 star reviews are complaints for the dashboard (PRD §7.10 "unresolved complaints"). */
const COMPLAINT_MAX_RATING = 2;
/** Identifier types a member may manage as public links (§7.10). */
const MEMBER_EDITABLE_IDENTIFIERS: IdentifierType[] = [
  IdentifierType.INSTAGRAM,
  IdentifierType.TIKTOK,
  IdentifierType.FACEBOOK,
  IdentifierType.X,
  IdentifierType.WEBSITE,
  IdentifierType.PHONE,
  IdentifierType.EMAIL,
];
const ACTIVE_DISPUTE: DisputeStatus[] = [
  DisputeStatus.OPEN,
  DisputeStatus.UNDER_REVIEW,
];

/** PRD v2.5 §7.7 responses, §7.8 resolution, §7.10 dashboard, §7.11 sharing, §8.4 disputes. Members only. */
@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private access: BusinessAccessService,
    private writer: BusinessWriterService,
    private ratings: RatingsService,
    private seo: SeoService,
    private notify: NotificationsService,
    private audit: AuditService,
    private revalidate: RevalidationService,
    private appConfig: AppConfig,
  ) {}

  private actor(user: AuthUser) {
    return { id: user.id, role: 'business_member' };
  }

  private async reviewOf(businessId: string, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, businessId, ...VISIBLE_REVIEW_WHERE },
      include: {
        response: true,
        business: { select: { name: true, slug: true } },
      },
    });
    if (!review)
      throw new NotFoundException('Review not found for this business');
    return review;
  }

  // ───────────────────────────────────────────────────────────── businesses

  async myBusinesses(userId: string): Promise<{ data: MyBusinessDto[] }> {
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
        id: m.business.id,
        slug: m.business.slug,
        name: m.business.name,
        logoUrl: m.business.logoUrl,
        category: m.business.category,
        status: m.business.status.toLowerCase(),
        ownership: ownershipBadge(
          m.business.ownershipStatus,
          m.business.ownershipVerified,
        ),
        rating: this.ratings.compact(m.business),
      })),
    };
  }

  async managementView(
    user: AuthUser,
    businessId: string,
  ): Promise<{ data: ManagementViewDto }> {
    await this.access.assertManager(user.id, businessId);
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: {
        category: { select: { slug: true, name: true } },
        city: { select: { slug: true, name: true, state: true } },
        identifiers: { orderBy: { createdAt: 'asc' } },
      },
    });
    const indexable = this.seo.isIndexable({
      ...b,
      identifierCount: b.identifiers.length,
    });
    const checklist: string[] = [];
    const minDesc = this.appConfig.indexableMinDescriptionChars;
    if ((b.description?.trim().length ?? 0) < minDesc)
      checklist.push(
        `Add a factual description of at least ${minDesc} characters`,
      );
    if (!b.cityId && !b.onlineOnly)
      checklist.push('Choose a city, or mark the business online only');
    if (!b.identifiers.length)
      checklist.push(
        'Add at least one public link (for example Instagram or website)',
      );
    if (b.reviewCount < this.appConfig.indexableMinReviews)
      checklist.push('Needs more published reviews');
    return {
      data: {
        id: b.id,
        slug: b.slug,
        name: b.name,
        description: b.description,
        logoUrl: b.logoUrl,
        website: b.website,
        publicEmail: b.publicEmail,
        publicPhone: b.publicPhone,
        category: b.category,
        location: presentLocation(b),
        status: b.status.toLowerCase(),
        ownership: ownershipBadge(b.ownershipStatus, b.ownershipVerified),
        identifiers: b.identifiers.map((i) => ({
          id: i.id,
          type: i.type.toLowerCase(),
          value: i.value,
          normalizedValue: i.normalizedValue,
          verified: i.verified,
          editableByOwner: MEMBER_EDITABLE_IDENTIFIERS.includes(i.type),
        })),
        indexable,
        indexingChecklist: indexable ? [] : checklist,
        editableFields: [
          'description',
          'logoUrl',
          'website',
          'publicEmail',
          'publicPhone',
          'city',
          'area',
          'onlineOnly',
          'public links',
        ],
        lockedFields: {
          fields: ['name', 'category'],
          reason:
            'Name and category changes are made by TalkGround staff, so a business cannot rename itself away from its reviews.',
        },
      },
    };
  }

  async updateProfile(
    user: AuthUser,
    businessId: string,
    dto: ManageBusinessDto,
  ) {
    const before = await this.access.assertManager(user.id, businessId);
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
    const locationTouched =
      dto.city !== undefined ||
      dto.area !== undefined ||
      dto.onlineOnly !== undefined;
    const location = locationTouched
      ? await this.writer.resolveLocation(dto, this.prisma, before)
      : null;
    await this.prisma.$transaction(async (tx) => {
      await this.writer.syncProfileIdentifiers(businessId, dto, tx);
      const after = await tx.business.update({
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
          ...(location ?? {}),
        },
      });
      await this.writer.rebuildSearchText(businessId, tx);
      await this.audit.record(
        this.actor(user),
        {
          action: 'business.profile_update_by_member',
          targetType: 'business',
          targetId: businessId,
          before: {
            description: before.description,
            website: before.website,
            publicEmail: before.publicEmail,
            publicPhone: before.publicPhone,
            cityId: before.cityId,
            area: before.area,
            onlineOnly: before.onlineOnly,
          },
          after: {
            description: after.description,
            website: after.website,
            publicEmail: after.publicEmail,
            publicPhone: after.publicPhone,
            cityId: after.cityId,
            area: after.area,
            onlineOnly: after.onlineOnly,
          },
        },
        tx,
      );
    });
    void this.revalidate.business(businessId);
    return this.managementView(user, businessId);
  }

  async addIdentifier(
    user: AuthUser,
    businessId: string,
    dto: IdentifierInputDto,
  ) {
    await this.access.assertManager(user.id, businessId);
    if (!MEMBER_EDITABLE_IDENTIFIERS.includes(dto.type))
      throw new ForbiddenException(
        'Only staff can add this type of identifier',
      );
    const { identifier, alsoUsedBy } = await this.writer.addIdentifier(
      businessId,
      dto,
    );
    await this.audit.record(this.actor(user), {
      action: 'business.identifier_add',
      targetType: 'business',
      targetId: businessId,
      after: { type: identifier.type, value: identifier.normalizedValue },
    });
    void this.revalidate.business(businessId);
    return {
      data: {
        identifier: {
          id: identifier.id,
          type: identifier.type.toLowerCase(),
          value: identifier.value,
          normalizedValue: identifier.normalizedValue,
          verified: identifier.verified,
          editableByOwner: true,
        },
        alsoUsedBy,
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
    if (!MEMBER_EDITABLE_IDENTIFIERS.includes(ident.type))
      throw new ForbiddenException('Only staff can remove this identifier');
    await this.writer.removeIdentifier(businessId, identifierId);
    await this.audit.record(this.actor(user), {
      action: 'business.identifier_remove',
      targetType: 'business',
      targetId: businessId,
      before: { type: ident.type, value: ident.normalizedValue },
    });
    void this.revalidate.business(businessId);
    return { data: { message: 'Removed' } };
  }

  // ─────────────────────────────────────────────────────────────── dashboard

  async dashboard(
    user: AuthUser,
    businessId: string,
  ): Promise<{ data: DashboardDto }> {
    const b = await this.access.assertManager(user.id, businessId);
    const visible: Prisma.ReviewWhereInput = {
      businessId,
      ...VISIBLE_REVIEW_WHERE,
    };
    const complaints: Prisma.ReviewWhereInput = {
      ...visible,
      overallRating: { lte: COMPLAINT_MAX_RATING },
      resolutionStatus: { not: ResolutionStatus.RESOLVED_BY_CONSUMER },
    };
    const [
      dimensions,
      recent,
      visibleCount,
      publishedCount,
      responded,
      responseTimes,
      unresolvedCount,
      unresolved,
      trend,
      openReports,
      openDisputes,
    ] = await Promise.all([
      this.ratings.dimensionBreakdown(b.id, b.categoryId),
      this.prisma.review.findMany({
        where: visible,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: PUBLIC_REVIEW_INCLUDE,
      }),
      this.prisma.review.count({ where: visible }),
      this.prisma.review.count({
        where: { businessId, ...RATED_REVIEW_WHERE },
      }),
      this.prisma.review.count({
        where: { ...visible, response: { status: ResponseStatus.PUBLISHED } },
      }),
      this.prisma.$queryRaw<{ hours: number | null }[]>`
          SELECT avg(extract(epoch FROM (resp."createdAt" - coalesce(r."publishedAt", r."createdAt"))) / 3600)::float AS hours
          FROM "BusinessResponse" resp JOIN "Review" r ON r.id = resp."reviewId"
          WHERE resp."businessId" = ${businessId} AND resp.status = 'PUBLISHED'`,
      this.prisma.review.count({ where: complaints }),
      this.prisma.review.findMany({
        where: complaints,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: PUBLIC_REVIEW_INCLUDE,
      }),
      this.prisma.$queryRaw<
        { month: Date; reviews: bigint; average: number | null }[]
      >`
          SELECT date_trunc('month', r."createdAt") AS month, count(*)::bigint AS reviews, avg(r."overallRating")::float AS average
          FROM "Review" r
          WHERE r."businessId" = ${businessId} AND r.status = 'PUBLISHED' AND r."deletedAt" IS NULL
            AND r."createdAt" >= date_trunc('month', now()) - interval '5 months'
          GROUP BY 1 ORDER BY 1`,
      this.prisma.reviewReport.count({ where: { businessId, status: 'OPEN' } }),
      this.prisma.businessDispute.count({
        where: { businessId, status: { in: ACTIVE_DISPUTE } },
      }),
    ]);
    const byMonth = new Map(
      trend.map((t) => [t.month.toISOString().slice(0, 7), t]),
    );
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - k), 1),
      );
      const key = d.toISOString().slice(0, 7);
      const t = byMonth.get(key);
      return {
        month: key,
        reviews: Number(t?.reviews ?? 0),
        averageRating: roundRating(t?.average ?? null),
      };
    });
    return {
      data: {
        business: {
          id: b.id,
          slug: b.slug,
          name: b.name,
          ownership: ownershipBadge(b.ownershipStatus, b.ownershipVerified),
        },
        rating: { ...this.ratings.summary(b), dimensions },
        publishedReviewCount: publishedCount,
        responseActivity: {
          responded,
          unanswered: visibleCount - responded,
          responseRate: visibleCount
            ? Math.round((responded / visibleCount) * 100)
            : null,
          averageResponseHours:
            responseTimes[0]?.hours != null
              ? Math.round(responseTimes[0].hours * 10) / 10
              : null,
        },
        unresolvedComplaints: {
          count: unresolvedCount,
          definition: `Reviews of ${COMPLAINT_MAX_RATING} stars or fewer that the reviewer has not marked resolved`,
          recent: unresolved.map((r) => presentReview(r)),
        },
        trend: months,
        issues: { openReports, openDisputes },
        recentReviews: recent.map((r) => presentReview(r)),
        shareLinks: this.shareLinksFor(b),
      },
    };
  }

  async reviews(
    user: AuthUser,
    businessId: string,
    q: PortalReviewQueryDto,
  ): Promise<{ data: PortalReviewDto[]; meta: ReturnType<typeof pageMeta> }> {
    await this.access.assertManager(user.id, businessId);
    const where: Prisma.ReviewWhereInput = {
      businessId,
      ...VISIBLE_REVIEW_WHERE,
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
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      data: rows.map((r) => {
        const dispute = r.disputes[0];
        return {
          ...presentReview(r),
          canRespond: !r.response,
          canEditResponse:
            !!r.response && r.response.status === ResponseStatus.PUBLISHED,
          canDispute: !dispute || !ACTIVE_DISPUTE.includes(dispute.status),
          disputeStatus: dispute ? dispute.status.toLowerCase() : null,
        };
      }),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  // ─────────────────────────────────────────────────────────────── sharing

  private shareLinksFor(b: { slug: string; name: string }): ShareLinksDto {
    const profileUrl = this.notify.frontendUrl(`/b/${b.slug}`);
    const reviewUrl = this.notify.frontendUrl(`/b/${b.slug}/review`);
    const text = 'See our reviews on TalkGround';
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return {
      profileUrl,
      reviewUrl,
      suggestedMessage: `We'd value your honest feedback about your experience with ${b.name}. You can share it on TalkGround: ${reviewUrl}`,
      whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(`Share your honest experience with ${b.name} on TalkGround: ${reviewUrl}`)}`,
      badge: {
        text,
        url: profileUrl,
        html: `<a href="${esc(profileUrl)}" rel="noopener" target="_blank">${text}</a>`,
      },
      policy:
        'Invite every customer, not only happy ones, and never offer anything for a review. The badge links to your public profile; it does not mean TalkGround endorses your business.',
    };
  }

  async shareLinks(
    user: AuthUser,
    businessId: string,
  ): Promise<{ data: ShareLinksDto }> {
    const b = await this.access.assertManager(user.id, businessId);
    return { data: this.shareLinksFor(b) };
  }

  // ───────────────────────────────────────────────────────────── responses

  /** PRD §7.7: one response per review, members only. Never changes the review or its rating. */
  async respond(
    user: AuthUser,
    businessId: string,
    reviewId: string,
    body: string,
  ): Promise<{ data: OwnResponseDto }> {
    await this.access.assertManager(user.id, businessId);
    const review = await this.reviewOf(businessId, reviewId);
    if (review.response)
      throw new ConflictException(
        'This review already has a response. Edit it instead.',
      );
    let response;
    try {
      response = await this.prisma.$transaction(async (tx) => {
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
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'This review already has a response. Edit it instead.',
        );
      }
      throw err;
    }
    void this.revalidate.business(businessId);
    await this.notify.toUser(
      review.userId,
      'review.business_response',
      `${review.business.name} responded to your review`,
      [
        `${review.business.name} posted a response to your review on TalkGround.`,
      ],
      {
        label: 'Read the response',
        path: `/b/${review.business.slug}#review-${reviewId}`,
      },
    );
    return {
      data: {
        id: response.id,
        body: response.body,
        createdAt: response.createdAt,
        editedAt: response.editedAt,
      },
    };
  }

  /** Versioned edits: every previous version is kept; the latest is shown. */
  async editResponse(
    user: AuthUser,
    businessId: string,
    reviewId: string,
    body: string,
  ): Promise<{ data: OwnResponseDto }> {
    await this.access.assertManager(user.id, businessId);
    await this.reviewOf(businessId, reviewId);
    const response = await this.prisma.businessResponse.findUnique({
      where: { reviewId },
    });
    if (!response || response.businessId !== businessId)
      throw new NotFoundException('No response to edit');
    if (response.status !== ResponseStatus.PUBLISHED)
      throw new ForbiddenException('This response was removed by a moderator');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.businessResponseRevision.create({
        data: {
          responseId: response.id,
          snapshot: { body: response.body, editedById: user.id },
        },
      });
      return tx.businessResponse.update({
        where: { id: response.id },
        data: { body: cleanText(body), editedAt: new Date() },
      });
    });
    void this.revalidate.business(businessId);
    return {
      data: {
        id: updated.id,
        body: updated.body,
        createdAt: updated.createdAt,
        editedAt: updated.editedAt,
      },
    };
  }

  /** PRD §7.8: a business may propose a resolution; only the reviewer can mark it resolved. */
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
        'The reviewer already marked this resolved',
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
    void this.revalidate.business(businessId);
    return {
      data: {
        status: 'resolution_proposed',
        label: RESOLUTION_LABELS.RESOLUTION_PROPOSED,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────── disputes

  /**
   * PRD §8.4: preserve the original review, flag it as under investigation, queue it for staff,
   * notify the reviewer, keep an audit trail. The business gets no deletion rights.
   */
  async dispute(
    user: AuthUser,
    businessId: string,
    reviewId: string,
    dto: CreateDisputeDto,
  ): Promise<{ data: DisputeCreatedDto }> {
    await this.access.assertManager(user.id, businessId);
    const review = await this.reviewOf(businessId, reviewId);
    let disputeId: string;
    try {
      disputeId = await this.prisma.$transaction(async (tx) => {
        const d = await tx.businessDispute.create({
          data: {
            reviewId,
            businessId,
            openedById: user.id,
            reason: cleanText(dto.reason),
            openKey: reviewId,
          },
        });
        await refreshUnderInvestigation(tx, reviewId);
        await this.audit.record(
          this.actor(user),
          {
            action: 'dispute.open',
            targetType: 'dispute',
            targetId: d.id,
            after: { status: DisputeStatus.OPEN },
            metadata: { reviewId, businessId },
          },
          tx,
        );
        return d.id;
      });
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
    void this.revalidate.business(businessId);
    await this.notify.toUser(
      review.userId,
      'dispute.update',
      `Your review of ${review.business.name} is under investigation`,
      [
        `${review.business.name} disputed your review. It stays visible, labelled "Under investigation", while TalkGround staff look at it.`,
        'You do not need to do anything. If you have supporting evidence such as a receipt, you can attach it to your review.',
      ],
      {
        label: 'View your review',
        path: `/b/${review.business.slug}#review-${reviewId}`,
      },
    );
    return {
      data: {
        id: disputeId,
        status: 'open',
        message:
          'TalkGround staff will review this against our rules and the available evidence. The review stays visible meanwhile.',
      },
    };
  }

  async issues(
    user: AuthUser,
    businessId: string,
  ): Promise<{ data: IssuesDto }> {
    await this.access.assertManager(user.id, businessId);
    const reviewSelect = {
      id: true,
      title: true,
      overallRating: true,
      status: true,
    };
    const [disputes, reports] = await Promise.all([
      this.prisma.businessDispute.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { review: { select: reviewSelect } },
      }),
      this.prisma.reviewReport.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { review: { select: reviewSelect } },
      }),
    ]);
    const ref = (r: {
      id: string;
      title: string;
      overallRating: number;
      status: string;
    }) => ({ ...r, status: r.status.toLowerCase() });
    return {
      data: {
        disputes: disputes.map((d) => ({
          id: d.id,
          reason: d.reason,
          status: d.status.toLowerCase(),
          decision: d.decision,
          decidedAt: d.decidedAt,
          createdAt: d.createdAt,
          review: ref(d.review),
        })),
        reports: reports.map((r) => ({
          id: r.id,
          reasonCode: r.reasonCode.toLowerCase(),
          status: r.status.toLowerCase(),
          resolutionNote: r.resolutionNote,
          createdAt: r.createdAt,
          review: ref(r.review),
        })),
      },
    };
  }
}
