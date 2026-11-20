import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessStatus,
  ClaimStatus,
  DisputeStatus,
  EmailStatus,
  EvidenceStatus,
  ListingSource,
  OwnershipStatus,
  Prisma,
  ReportStatus,
  ReviewStatus,
  SubmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { BusinessWriterService } from '../businesses/business-writer.service';
import { RatingsService } from '../businesses/ratings.service';
import { SeoService } from '../businesses/seo.service';
import { presentLocation } from '../businesses/businesses.service';
import { assertTransition, canTransition } from '../businesses/lifecycle';
import { RevalidationService } from '../revalidation/revalidation.service';
import { ModerationService } from '../moderation/moderation.service';
import { PERMISSIONS, ALL_PERMISSIONS } from '../common/permissions';
import { pageMeta, skipTake } from '../common/pagination';
import { normalizeNigerianPhone } from '../common/identifiers';
import { cleanText, slugify } from '../common/utils';
import type { AuthUser } from '../common/current-user.decorator';
import type {
  AdminUpdateBusinessDto,
  CreateBusinessDto,
  IdentifierInputDto,
} from '../businesses/businesses.dto';
import type {
  AdminBusinessQueryDto,
  BusinessStatusDto,
  CreateCategoryDto,
  CreateCityDto,
  CreateDimensionDto,
  MergeBusinessDto,
  NoindexDto,
  UpdateCategoryDto,
  UpdateCityDto,
  UpdateDimensionDto,
  UserListQueryDto,
} from './admin.dto';
import type {
  AdminBusinessDetailDto,
  AdminBusinessListItemDto,
  AdminDashboardDto,
  DuplicatePairDto,
  RolesDto,
  TaxonomyDto,
} from './admin.responses';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  emailVerified: true,
  phoneVerified: true,
  suspended: true,
  suspendedReason: true,
  deletedAt: true,
  createdAt: true,
  adminRole: { select: { key: true, name: true } },
} satisfies Prisma.UserSelect;

const BUSINESS_LIST_INCLUDE = {
  category: { select: { slug: true, name: true } },
  city: { select: { slug: true, name: true, state: true } },
  _count: {
    select: {
      claims: { where: { status: ClaimStatus.PENDING } },
      identifiers: true,
    },
  },
} satisfies Prisma.BusinessInclude;

type BusinessListRow = Prisma.BusinessGetPayload<{
  include: typeof BUSINESS_LIST_INCLUDE;
}>;

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private auth: AuthService,
    private writer: BusinessWriterService,
    private ratings: RatingsService,
    private seo: SeoService,
    private revalidate: RevalidationService,
    private moderation: ModerationService,
  ) {}

  private actor(user: AuthUser) {
    return { id: user.id, role: user.adminRole ?? undefined };
  }

  // ─────────────────────────────────────────────────────────────── dashboard

  async dashboard(): Promise<{ data: AdminDashboardDto }> {
    const c = (p: Promise<number>) => p;
    const [
      publishedBusinesses,
      claimedBusinesses,
      publishedReviews,
      users,
      pendingReviews,
      underInvestigation,
      openReports,
      activeDisputes,
      pendingClaims,
      pendingSubmissions,
      evidenceToReview,
      failedEmails,
    ] = await Promise.all([
      c(
        this.prisma.business.count({
          where: { status: BusinessStatus.PUBLISHED },
        }),
      ),
      c(
        this.prisma.business.count({
          where: {
            status: BusinessStatus.PUBLISHED,
            ownershipStatus: OwnershipStatus.CLAIMED,
          },
        }),
      ),
      c(
        this.prisma.review.count({
          where: { status: ReviewStatus.PUBLISHED, deletedAt: null },
        }),
      ),
      c(this.prisma.user.count({ where: { deletedAt: null } })),
      c(
        this.prisma.review.count({
          where: { status: ReviewStatus.PENDING, deletedAt: null },
        }),
      ),
      c(
        this.prisma.review.count({
          where: {
            deletedAt: null,
            OR: [
              { underInvestigation: true },
              { status: ReviewStatus.UNDER_INVESTIGATION },
            ],
          },
        }),
      ),
      c(
        this.prisma.reviewReport.count({
          where: { status: ReportStatus.OPEN },
        }),
      ),
      c(
        this.prisma.businessDispute.count({
          where: {
            status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
          },
        }),
      ),
      c(
        this.prisma.businessClaim.count({
          where: { status: ClaimStatus.PENDING },
        }),
      ),
      c(
        this.prisma.businessSubmission.count({
          where: { status: SubmissionStatus.PENDING_REVIEW },
        }),
      ),
      c(
        this.prisma.review.count({
          where: {
            evidenceAttached: true,
            evidenceStatus: EvidenceStatus.NOT_REVIEWED,
            deletedAt: null,
          },
        }),
      ),
      c(
        this.prisma.notificationEmail.count({
          where: { status: EmailStatus.FAILED },
        }),
      ),
    ]);
    return {
      data: {
        totals: {
          publishedBusinesses,
          claimedBusinesses,
          publishedReviews,
          users,
        },
        queues: {
          pendingReviews,
          underInvestigation,
          openReports,
          activeDisputes,
          pendingClaims,
          pendingSubmissions,
          evidenceToReview,
          failedEmails,
        },
      },
    };
  }

  // ──────────────────────────────────────────────────────────── users & staff

  async listUsers(q: UserListQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { username: { contains: q.q, mode: 'insensitive' } },
              { displayName: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(q.filter === 'suspended' ? { suspended: true } : {}),
      ...(q.filter === 'staff' ? { adminRoleId: { not: null } } : {}),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.limit),
      }),
    ]);
    return { data: users, meta: pageMeta(q.page, q.limit, total) };
  }

  async userDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...SAFE_USER_SELECT,
        memberships: {
          where: { revokedAt: null },
          select: {
            role: true,
            business: { select: { id: true, slug: true, name: true } },
          },
        },
        _count: {
          select: {
            reviews: true,
            reports: true,
            claims: true,
            submissions: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const recentReviews = await this.prisma.review.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        overallRating: true,
        title: true,
        status: true,
        deletedAt: true,
        createdAt: true,
        business: { select: { slug: true, name: true } },
        flags: { select: { type: true } },
      },
    });
    const { _count, memberships, ...rest } = user;
    return { data: { ...rest, memberships, recentReviews, counts: _count } };
  }

  /** PRD §8.5 user suspension. Suspension signs the user out everywhere. */
  async suspendUser(
    actor: AuthUser,
    id: string,
    suspended: boolean,
    reason: string,
  ) {
    if (id === actor.id)
      throw new BadRequestException('You cannot suspend your own account');
    const target = await this.prisma.user.findUnique({
      where: { id },
      include: { adminRole: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (
      target.adminRole &&
      !actor.permissions.includes(PERMISSIONS.ROLE_ASSIGN)
    ) {
      throw new ForbiddenException(
        'Suspending a staff member requires role.assign',
      );
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        suspended,
        suspendedReason: suspended ? cleanText(reason) : null,
      },
      select: SAFE_USER_SELECT,
    });
    if (suspended) await this.auth.revokeAllSessions(id);
    await this.audit.record(this.actor(actor), {
      action: suspended ? 'user.suspend' : 'user.unsuspend',
      targetType: 'user',
      targetId: id,
      before: { suspended: target.suspended },
      after: { suspended },
      reason,
    });
    if (suspended) {
      const reviewed = await this.prisma.review.findMany({
        where: { userId: id },
        select: { businessId: true },
        distinct: ['businessId'],
      });
      void this.revalidate.businesses(reviewed.map((r) => r.businessId));
    }
    return { data: user };
  }

  async roles(): Promise<{ data: RolesDto }> {
    const rows = await this.prisma.adminRole.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return {
      data: {
        roles: rows.map((r) => ({
          key: r.key,
          name: r.name,
          description: r.description,
          permissions: r.permissions,
          members: r._count.users,
        })),
        allPermissions: ALL_PERMISSIONS,
      },
    };
  }

  /** PRD §9 role.assign. Always audited (target type "role"); the user's sessions are revoked. */
  async setStaffRole(
    actor: AuthUser,
    id: string,
    roleKey: string | null,
    reason: string,
  ) {
    if (id === actor.id)
      throw new BadRequestException('You cannot change your own staff role');
    const target = await this.prisma.user.findUnique({
      where: { id },
      include: { adminRole: true },
    });
    if (!target || target.deletedAt)
      throw new NotFoundException('User not found');
    const role = roleKey
      ? await this.prisma.adminRole.findUnique({ where: { key: roleKey } })
      : null;
    if (roleKey && !role)
      throw new BadRequestException(`Unknown role: ${roleKey}`);
    if (role && !target.emailVerified)
      throw new BadRequestException(
        'Staff accounts must have a verified email address',
      );
    if (
      target.adminRole?.key === 'super_admin' &&
      role?.key !== 'super_admin'
    ) {
      const remaining = await this.prisma.user.count({
        where: {
          adminRole: { key: 'super_admin' },
          id: { not: id },
          suspended: false,
          deletedAt: null,
        },
      });
      if (!remaining)
        throw new ConflictException('This is the last active super admin');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { adminRoleId: role?.id ?? null },
      select: SAFE_USER_SELECT,
    });
    await this.auth.revokeAllSessions(id);
    await this.audit.record(this.actor(actor), {
      action: 'role.assign',
      targetType: 'role',
      targetId: id,
      before: { role: target.adminRole?.key ?? null },
      after: { role: role?.key ?? null },
      reason,
    });
    return { data: user };
  }

  // ──────────────────────────────────────────────────────────────── businesses

  private presentListItem(b: BusinessListRow): AdminBusinessListItemDto {
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      category: b.category,
      location: presentLocation(b),
      status: b.status.toLowerCase(),
      ownershipStatus: b.ownershipStatus.toLowerCase(),
      ownershipVerified: b.ownershipVerified,
      createdBySource: b.createdBySource.toLowerCase(),
      noindexOverride: b.noindexOverride,
      indexable: this.seo.isIndexable({
        ...b,
        identifierCount: b._count.identifiers,
      }),
      reviewCount: b.reviewCount,
      pendingClaims: b._count.claims,
      createdAt: b.createdAt,
    };
  }

  async listBusinesses(q: AdminBusinessQueryDto) {
    const where: Prisma.BusinessWhereInput = {
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(q.status ? { status: q.status.toUpperCase() as BusinessStatus } : {}),
      ...(q.ownership
        ? { ownershipStatus: q.ownership.toUpperCase() as OwnershipStatus }
        : {}),
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.city ? { city: { slug: q.city } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.business.count({ where }),
      this.prisma.business.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.limit),
        include: BUSINESS_LIST_INCLUDE,
      }),
    ]);
    return {
      data: rows.map((b) => this.presentListItem(b)),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  async businessDetail(id: string): Promise<{ data: AdminBusinessDetailDto }> {
    const b = await this.prisma.business.findUnique({
      where: { id },
      include: {
        ...BUSINESS_LIST_INCLUDE,
        identifiers: { orderBy: { createdAt: 'asc' } },
        slugHistory: { orderBy: { createdAt: 'desc' } },
        members: {
          where: { revokedAt: null },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                email: true,
              },
            },
          },
        },
        mergedInto: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!b) throw new NotFoundException('Business not found');
    const [dimensions, duplicates, history] = await Promise.all([
      this.ratings.dimensionBreakdown(b.id, b.categoryId),
      b.status === BusinessStatus.MERGED
        ? Promise.resolve([])
        : this.writer.findDuplicateCandidates({
            name: b.name,
            identifiers: b.identifiers,
            excludeBusinessId: b.id,
          }),
      this.audit.list({
        page: 1,
        limit: 20,
        targetType: 'business',
        targetId: b.id,
      }),
    ]);
    const allStatuses = Object.values(BusinessStatus);
    return {
      data: {
        ...this.presentListItem(b),
        description: b.description,
        logoUrl: b.logoUrl,
        website: b.website,
        publicEmail: b.publicEmail,
        publicPhone: b.publicPhone,
        identifiers: b.identifiers.map((i) => ({
          id: i.id,
          type: i.type.toLowerCase(),
          value: i.value,
          normalizedValue: i.normalizedValue,
          verified: i.verified,
          editableByOwner: true,
        })),
        previousSlugs: b.slugHistory.map((h) => h.oldSlug),
        rating: { ...this.ratings.summary(b), dimensions },
        members: b.members.map((m) => ({
          ...m.user,
          role: m.role.toLowerCase(),
          since: m.createdAt,
        })),
        mergedInto: b.mergedInto,
        duplicateCandidates: duplicates,
        allowedTransitions: allStatuses
          .filter((s) => canTransition(b.status, s))
          .map((s) => s.toLowerCase()),
        auditTrail: history.data,
      },
    };
  }

  /**
   * PRD §6.2 source 1: staff-created listing. Possible duplicates need explicit confirmation;
   * a description is required to publish so admins never bulk-create thin pages (§7.13).
   */
  async createBusiness(actor: AuthUser, dto: CreateBusinessDto) {
    const categoryId = await this.writer.categoryIdBySlug(dto.category);
    const location = await this.writer.resolveLocation(dto);
    const identifiers = this.writer.prepareIdentifiers([
      ...(dto.identifiers ?? []),
      ...this.writer.profileFieldIdentifiers(dto),
    ]);
    this.writer.assertNoUnconfirmedDuplicates(
      await this.writer.findDuplicateCandidates({
        name: dto.name,
        identifiers,
      }),
      dto.confirmNotDuplicate,
    );
    const publish = dto.publish !== false;
    const business = await this.prisma.$transaction(async (tx) => {
      const created = await this.writer.create(
        {
          ...dto,
          categoryId,
          ...location,
          status: publish
            ? BusinessStatus.PUBLISHED
            : BusinessStatus.PENDING_REVIEW,
          createdBySource: ListingSource.ADMIN,
          createdById: actor.id,
        },
        tx,
      );
      await this.audit.record(
        this.actor(actor),
        {
          action: 'business.create',
          targetType: 'business',
          targetId: created.id,
          after: {
            name: created.name,
            status: created.status,
            slug: created.slug,
          },
        },
        tx,
      );
      return created;
    });
    void this.revalidate.business(business.id);
    return this.businessDetail(business.id);
  }

  async updateBusiness(
    actor: AuthUser,
    id: string,
    dto: AdminUpdateBusinessDto,
  ) {
    const existing = await this.prisma.business.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Business not found');
    if (dto.publicPhone && !normalizeNigerianPhone(dto.publicPhone))
      throw new BadRequestException(
        'publicPhone must be a Nigerian phone number',
      );
    const categoryId = dto.category
      ? await this.writer.categoryIdBySlug(dto.category, this.prisma, true)
      : undefined;
    const locationTouched =
      dto.city !== undefined ||
      dto.area !== undefined ||
      dto.onlineOnly !== undefined;
    const location = locationTouched
      ? await this.writer.resolveLocation(dto, this.prisma, existing)
      : null;
    await this.prisma.$transaction(async (tx) => {
      if (dto.name) await this.writer.rename(id, dto.name, tx);
      await this.writer.syncProfileIdentifiers(id, dto, tx);
      const after = await tx.business.update({
        where: { id },
        data: {
          ...(categoryId ? { categoryId } : {}),
          ...(location ?? {}),
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
      await this.writer.rebuildSearchText(id, tx);
      await this.audit.record(
        this.actor(actor),
        {
          action: 'business.update',
          targetType: 'business',
          targetId: id,
          before: {
            name: existing.name,
            slug: existing.slug,
            categoryId: existing.categoryId,
            cityId: existing.cityId,
            area: existing.area,
            description: existing.description,
          },
          after: {
            name: after.name,
            slug: after.slug,
            categoryId: after.categoryId,
            cityId: after.cityId,
            area: after.area,
            description: after.description,
          },
        },
        tx,
      );
    });
    void this.revalidate.paths([`/b/${existing.slug}`]);
    void this.revalidate.business(id);
    return this.businessDetail(id);
  }

  async addIdentifier(actor: AuthUser, id: string, dto: IdentifierInputDto) {
    const { identifier, alsoUsedBy } = await this.writer.addIdentifier(id, dto);
    await this.audit.record(this.actor(actor), {
      action: 'business.identifier_add',
      targetType: 'business',
      targetId: id,
      after: { type: identifier.type, value: identifier.normalizedValue },
    });
    void this.revalidate.business(id);
    return { data: { identifier, alsoUsedBy } };
  }

  async removeIdentifier(actor: AuthUser, id: string, identifierId: string) {
    const ident = await this.prisma.businessIdentifier.findFirst({
      where: { id: identifierId, businessId: id },
    });
    await this.writer.removeIdentifier(id, identifierId);
    await this.audit.record(this.actor(actor), {
      action: 'business.identifier_remove',
      targetType: 'business',
      targetId: id,
      before: ident ? { type: ident.type, value: ident.normalizedValue } : null,
    });
    void this.revalidate.business(id);
    return { data: { message: 'Removed' } };
  }

  /** PRD §7.4 transitions only; suspending or unsuspending also needs business.suspend. */
  async setStatus(actor: AuthUser, id: string, dto: BusinessStatusDto) {
    const b = await this.prisma.business.findUnique({
      where: { id },
      include: { _count: { select: { identifiers: true } } },
    });
    if (!b) throw new NotFoundException('Business not found');
    const next = dto.status.toUpperCase() as BusinessStatus;
    assertTransition(b.status, next);
    if (
      (next === BusinessStatus.SUSPENDED ||
        b.status === BusinessStatus.SUSPENDED) &&
      !actor.permissions.includes(PERMISSIONS.BUSINESS_SUSPEND)
    ) {
      throw new ForbiddenException('Missing permission: business.suspend');
    }
    if (
      next === BusinessStatus.PUBLISHED &&
      b.status === BusinessStatus.PENDING_REVIEW &&
      !b.description
    ) {
      throw new BadRequestException(
        'Add a factual description before publishing (PRD §7.13)',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id },
        data: {
          status: next,
          ...(next === BusinessStatus.PUBLISHED && !b.publishedAt
            ? { publishedAt: new Date() }
            : {}),
        },
      });
      await this.audit.record(
        this.actor(actor),
        {
          action: `business.status.${dto.status}`,
          targetType: 'business',
          targetId: id,
          before: { status: b.status },
          after: { status: next },
          reason: dto.reason,
        },
        tx,
      );
    });
    void this.revalidate.business(id);
    return this.businessDetail(id);
  }

  /** PRD §7.13: a moderator can force noindex (e.g. during a legal complaint). Audited. */
  async setNoindex(actor: AuthUser, id: string, dto: NoindexDto) {
    const b = await this.prisma.business.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Business not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id },
        data: { noindexOverride: dto.noindex },
      });
      await this.moderation.record(
        actor,
        {
          targetType: 'BUSINESS',
          targetId: id,
          action: dto.noindex ? 'NOINDEX_ON' : 'NOINDEX_OFF',
          reason: 'OTHER',
          note: dto.reason,
          before: { noindexOverride: b.noindexOverride },
          after: { noindexOverride: dto.noindex },
        },
        tx,
      );
    });
    void this.revalidate.business(id);
    return this.businessDetail(id);
  }

  async duplicatesOf(id: string) {
    const b = await this.prisma.business.findUnique({
      where: { id },
      include: { identifiers: true },
    });
    if (!b) throw new NotFoundException('Business not found');
    return {
      data: await this.writer.findDuplicateCandidates({
        name: b.name,
        identifiers: b.identifiers,
        excludeBusinessId: id,
      }),
    };
  }

  /** Platform-wide duplicate scan: shared identifiers (strongest: social handles) and similar names. */
  async duplicateScan(): Promise<{ data: DuplicatePairDto[] }> {
    const [shared, similar] = await Promise.all([
      this.prisma.$queryRaw<
        {
          aId: string;
          aSlug: string;
          aName: string;
          bId: string;
          bSlug: string;
          bName: string;
          signal: string;
        }[]
      >`
        SELECT a.id AS "aId", a.slug AS "aSlug", a.name AS "aName", b.id AS "bId", b.slug AS "bSlug", b.name AS "bName",
               lower(ia.type::text) || ':' || ia."normalizedValue" AS signal
        FROM "BusinessIdentifier" ia
        JOIN "BusinessIdentifier" ib ON ib.type = ia.type AND ib."normalizedValue" = ia."normalizedValue" AND ib."businessId" > ia."businessId"
        JOIN "Business" a ON a.id = ia."businessId"
        JOIN "Business" b ON b.id = ib."businessId"
        WHERE a.status NOT IN ('MERGED', 'ARCHIVED', 'REJECTED') AND b.status NOT IN ('MERGED', 'ARCHIVED', 'REJECTED')
        LIMIT 200`,
      this.prisma.$queryRaw<
        {
          aId: string;
          aSlug: string;
          aName: string;
          bId: string;
          bSlug: string;
          bName: string;
          sim: number;
        }[]
      >`
        SELECT a.id AS "aId", a.slug AS "aSlug", a.name AS "aName", b.id AS "bId", b.slug AS "bSlug", b.name AS "bName",
               similarity(lower(a.name), lower(b.name)) AS sim
        FROM "Business" a
        JOIN "Business" b ON a.id < b.id AND lower(a.name) % lower(b.name)
        WHERE a.status NOT IN ('MERGED', 'ARCHIVED', 'REJECTED') AND b.status NOT IN ('MERGED', 'ARCHIVED', 'REJECTED')
          AND similarity(lower(a.name), lower(b.name)) > 0.5
        ORDER BY sim DESC
        LIMIT 100`,
    ]);
    const pairs = new Map<string, DuplicatePairDto>();
    const key = (x: string, y: string) => [x, y].sort().join('|');
    for (const s of shared) {
      const k = key(s.aId, s.bId);
      const p = pairs.get(k) ?? {
        a: { id: s.aId, slug: s.aSlug, name: s.aName },
        b: { id: s.bId, slug: s.bSlug, name: s.bName },
        signals: [],
        nameSimilarity: null,
      };
      p.signals.push(`same ${s.signal}`);
      pairs.set(k, p);
    }
    for (const s of similar) {
      const k = key(s.aId, s.bId);
      const p = pairs.get(k) ?? {
        a: { id: s.aId, slug: s.aSlug, name: s.aName },
        b: { id: s.bId, slug: s.bSlug, name: s.bName },
        signals: [],
        nameSimilarity: null,
      };
      p.nameSimilarity = Math.round(s.sim * 100) / 100;
      p.signals.push(`similar name (${Math.round(s.sim * 100)}%)`);
      pairs.set(k, p);
    }
    return {
      data: [...pairs.values()]
        .sort((x, y) => y.signals.length - x.signals.length)
        .slice(0, 100),
    };
  }

  async merge(actor: AuthUser, sourceId: string, dto: MergeBusinessDto) {
    const result = await this.writer.merge(sourceId, dto.targetId);
    await this.audit.record(this.actor(actor), {
      action: 'business.merge',
      targetType: 'business',
      targetId: sourceId,
      before: result.before,
      after: { status: BusinessStatus.MERGED, mergedIntoId: dto.targetId },
      reason: dto.reason,
      metadata: { movedReviews: result.movedReviews },
    });
    void this.revalidate.paths([`/b/${result.source.slug}`]);
    void this.revalidate.business(dto.targetId);
    const { before: _b, ...data } = result;
    return { data };
  }

  // ─────────────────────────────────────────────────── categories, dimensions, cities

  async listTaxonomy(): Promise<{ data: TaxonomyDto }> {
    const [categories, dimensions, cities, cityCounts] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          parent: { select: { slug: true } },
          dimensions: {
            orderBy: { order: 'asc' },
            include: { dimension: true },
          },
          _count: { select: { businesses: true } },
        },
      }),
      this.prisma.ratingDimension.findMany({ orderBy: { label: 'asc' } }),
      this.prisma.city.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.business.groupBy({ by: ['cityId'], _count: { _all: true } }),
    ]);
    const countBy = new Map(cityCounts.map((c) => [c.cityId, c._count._all]));
    return {
      data: {
        categories: categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          active: c.active,
          parentSlug: c.parent?.slug ?? null,
          sortOrder: c.sortOrder,
          businessCount: c._count.businesses,
          dimensions: c.dimensions.map((d) => ({
            key: d.dimension.key,
            label: d.dimension.label,
            required: d.required,
            order: d.order,
          })),
        })),
        dimensions: dimensions.map((d) => ({
          id: d.id,
          key: d.key,
          label: d.label,
          description: d.description,
          active: d.active,
        })),
        cities: cities.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          state: c.state,
          countryCode: c.countryCode,
          active: c.active,
          businessCount: countBy.get(c.id) ?? 0,
        })),
      },
    };
  }

  private async setCategoryDimensions(
    tx: Prisma.TransactionClient,
    categoryId: string,
    input: { key: string; required: boolean }[],
  ) {
    const dims = await tx.ratingDimension.findMany({
      where: { key: { in: input.map((d) => d.key) } },
    });
    const byKey = new Map(dims.map((d) => [d.key, d]));
    const missing = input.filter((d) => !byKey.has(d.key)).map((d) => d.key);
    if (missing.length)
      throw new BadRequestException(`Unknown dimension: ${missing.join(', ')}`);
    await tx.categoryDimension.deleteMany({ where: { categoryId } });
    await tx.categoryDimension.createMany({
      data: input.map((d, i) => ({
        categoryId,
        dimensionId: byKey.get(d.key)!.id,
        required: d.required,
        order: i + 1,
      })),
    });
  }

  private async parentId(
    slug: string | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<string | null | undefined> {
    if (slug === undefined) return undefined;
    if (slug === '') return null;
    const parent = await tx.category.findUnique({ where: { slug } });
    if (!parent)
      throw new BadRequestException(`Unknown parent category: ${slug}`);
    return parent.id;
  }

  async createCategory(actor: AuthUser, dto: CreateCategoryDto) {
    if (await this.prisma.category.findUnique({ where: { slug: dto.slug } }))
      throw new ConflictException('A category with this slug exists');
    const category = await this.prisma.$transaction(async (tx) => {
      const c = await tx.category.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          description: dto.description ?? null,
          sortOrder: dto.sortOrder ?? 100,
          active: dto.active ?? true,
          parentId: (await this.parentId(dto.parentSlug, tx)) ?? null,
        },
      });
      if (dto.dimensions)
        await this.setCategoryDimensions(tx, c.id, dto.dimensions);
      await this.audit.record(
        this.actor(actor),
        {
          action: 'category.create',
          targetType: 'category',
          targetId: c.id,
          after: { slug: c.slug, name: c.name, active: c.active },
        },
        tx,
      );
      return c;
    });
    return { data: category };
  }

  /** Dimension changes apply to new reviews; existing ratings are kept. */
  async updateCategory(actor: AuthUser, slug: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Category not found');
    const category = await this.prisma.$transaction(async (tx) => {
      const parentId = await this.parentId(dto.parentSlug, tx);
      if (parentId === existing.id)
        throw new BadRequestException('A category cannot be its own parent');
      const c = await tx.category.update({
        where: { slug },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
        },
      });
      if (dto.dimensions)
        await this.setCategoryDimensions(tx, c.id, dto.dimensions);
      await this.audit.record(
        this.actor(actor),
        {
          action: 'category.update',
          targetType: 'category',
          targetId: c.id,
          before: {
            name: existing.name,
            active: existing.active,
            parentId: existing.parentId,
          },
          after: {
            name: c.name,
            active: c.active,
            parentId: c.parentId,
            ...(dto.dimensions ? { dimensions: dto.dimensions } : {}),
          },
        },
        tx,
      );
      return c;
    });
    return { data: category };
  }

  async createDimension(actor: AuthUser, dto: CreateDimensionDto) {
    if (
      await this.prisma.ratingDimension.findUnique({ where: { key: dto.key } })
    )
      throw new ConflictException('A dimension with this key exists');
    const d = await this.prisma.ratingDimension.create({
      data: {
        key: dto.key,
        label: dto.label,
        description: dto.description ?? null,
        active: dto.active ?? true,
      },
    });
    await this.audit.record(this.actor(actor), {
      action: 'category.dimension_create',
      targetType: 'category',
      targetId: d.id,
      after: { key: d.key, label: d.label },
    });
    return { data: d };
  }

  async updateDimension(actor: AuthUser, key: string, dto: UpdateDimensionDto) {
    const existing = await this.prisma.ratingDimension.findUnique({
      where: { key },
    });
    if (!existing) throw new NotFoundException('Dimension not found');
    const d = await this.prisma.ratingDimension.update({
      where: { key },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.record(this.actor(actor), {
      action: 'category.dimension_update',
      targetType: 'category',
      targetId: d.id,
      before: { label: existing.label, active: existing.active },
      after: { label: d.label, active: d.active },
    });
    return { data: d };
  }

  /** PRD §5: adding a city is an admin action, no deploy. Audited under target type "category" (§8.5 list). */
  async createCity(actor: AuthUser, dto: CreateCityDto) {
    const slug = slugify(dto.name);
    if (await this.prisma.city.findUnique({ where: { slug } }))
      throw new ConflictException('A city with this name exists');
    const city = await this.prisma.city.create({
      data: {
        slug,
        name: cleanText(dto.name),
        state: cleanText(dto.state),
        countryCode: dto.countryCode ?? 'NG',
        active: dto.active ?? true,
      },
    });
    await this.audit.record(this.actor(actor), {
      action: 'city.create',
      targetType: 'category',
      targetId: city.id,
      after: { slug: city.slug, name: city.name, state: city.state },
      metadata: { kind: 'city' },
    });
    return { data: city };
  }

  async updateCity(actor: AuthUser, slug: string, dto: UpdateCityDto) {
    const existing = await this.prisma.city.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('City not found');
    const city = await this.prisma.city.update({
      where: { slug },
      data: {
        ...(dto.name !== undefined ? { name: cleanText(dto.name) } : {}),
        ...(dto.state !== undefined ? { state: cleanText(dto.state) } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.record(this.actor(actor), {
      action: 'city.update',
      targetType: 'category',
      targetId: city.id,
      before: {
        name: existing.name,
        state: existing.state,
        active: existing.active,
      },
      after: { name: city.name, state: city.state, active: city.active },
      metadata: { kind: 'city' },
    });
    return { data: city };
  }
}
