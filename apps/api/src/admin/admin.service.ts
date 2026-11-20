import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminPermission,
  BusinessSource,
  BusinessStatus,
  ClaimStatus,
  DisputeStatus,
  EvidenceStatus,
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
import { BusinessesService } from '../businesses/businesses.service';
import { RatingsService } from '../businesses/ratings.service';
import { lifecycleStage } from '../businesses/lifecycle';
import { pageMeta, skipTake } from '../common/pagination';
import { normalizeNigerianPhone } from '../common/identifiers';
import { cleanText } from '../common/utils';
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
  CreateDimensionDto,
  InvestigationDto,
  MergeBusinessDto,
  UpsertCategoryDto,
  UpsertDimensionDto,
  UserListQueryDto,
} from './admin.dto';

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

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private auth: AuthService,
    private writer: BusinessWriterService,
    private businesses: BusinessesService,
    private ratings: RatingsService,
  ) {}

  private actor(user: AuthUser) {
    return { id: user.id, role: user.adminRole ?? undefined };
  }

  // ─────────────────────────────────────────────────────────────── dashboard

  /** Work queues + headline numbers (PRD §8.1, §15). Every staff member can see it. */
  async dashboard() {
    const [
      businesses,
      claimed,
      reviews,
      users,
      pendingModeration,
      underInvestigation,
      openReports,
      openDisputes,
      pendingClaims,
      pendingSubmissions,
      evidenceToReview,
    ] = await Promise.all([
      this.prisma.business.count({
        where: { status: BusinessStatus.PUBLISHED },
      }),
      this.prisma.business.count({
        where: {
          status: BusinessStatus.PUBLISHED,
          ownershipStatus: {
            in: [OwnershipStatus.CLAIMED, OwnershipStatus.VERIFIED],
          },
        },
      }),
      this.prisma.review.count({
        where: {
          status: {
            in: [ReviewStatus.PUBLISHED, ReviewStatus.UNDER_INVESTIGATION],
          },
        },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.review.count({
        where: { status: ReviewStatus.PENDING_MODERATION },
      }),
      this.prisma.review.count({
        where: { status: ReviewStatus.UNDER_INVESTIGATION },
      }),
      this.prisma.reviewReport.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.businessDispute.count({
        where: { status: DisputeStatus.OPEN },
      }),
      this.prisma.businessClaim.count({
        where: { status: ClaimStatus.PENDING },
      }),
      this.prisma.businessSubmission.count({
        where: { status: SubmissionStatus.PENDING_REVIEW },
      }),
      this.prisma.reviewEvidence.count({
        where: { status: EvidenceStatus.NOT_REVIEWED },
      }),
    ]);
    return {
      data: {
        totals: {
          publishedBusinesses: businesses,
          claimedBusinesses: claimed,
          publishedReviews: reviews,
          users,
        },
        queues: {
          pendingModeration,
          underInvestigation,
          openReports,
          openDisputes,
          pendingClaims,
          pendingSubmissions,
          evidenceToReview,
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
        select: {
          ...SAFE_USER_SELECT,
          _count: {
            select: { reviews: true, reports: true, memberships: true },
          },
        },
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
        createdAt: true,
        business: { select: { slug: true, name: true } },
        flags: { select: { type: true } },
      },
    });
    return { data: { ...user, recentReviews } };
  }

  /** PRD §8.1 "restrict abusive accounts". Suspension signs the user out everywhere. */
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
      !actor.permissions.includes(AdminPermission.STAFF_MANAGE)
    ) {
      throw new ForbiddenException(
        'Suspending a staff member requires STAFF_MANAGE',
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
      metadata: { reason },
    });
    return { data: user };
  }

  roles() {
    return this.prisma.adminRole
      .findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { users: true } } },
      })
      .then((rows) => ({
        data: rows.map((r) => ({
          key: r.key,
          name: r.name,
          description: r.description,
          permissions: r.permissions,
          members: r._count.users,
        })),
        allPermissions: Object.values(AdminPermission),
      }));
  }

  /** PRD §8.5 "administrative account changes" — always audited; sessions are revoked. */
  async setStaffRole(actor: AuthUser, id: string, roleKey: string | null) {
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
    if (role && !target.emailVerified) {
      throw new BadRequestException(
        'Staff accounts must have a verified email address',
      );
    }
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
      action: 'user.staff_role_change',
      targetType: 'user',
      targetId: id,
      metadata: { from: target.adminRole?.key ?? null, to: role?.key ?? null },
    });
    return { data: user };
  }

  // ──────────────────────────────────────────────────────────────── businesses

  async listBusinesses(q: AdminBusinessQueryDto) {
    const where: Prisma.BusinessWhereInput = {
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(q.status ? { status: q.status.toUpperCase() as BusinessStatus } : {}),
      ...(q.ownership
        ? { ownershipStatus: q.ownership.toUpperCase() as OwnershipStatus }
        : {}),
      ...(q.category ? { category: { slug: q.category } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.business.count({ where }),
      this.prisma.business.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.limit),
        include: {
          category: { select: { slug: true, name: true } },
          _count: {
            select: { claims: { where: { status: ClaimStatus.PENDING } } },
          },
        },
      }),
    ]);
    return {
      data: rows.map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        category: b.category,
        status: b.status.toLowerCase(),
        ownershipStatus: b.ownershipStatus.toLowerCase(),
        lifecycleStage: lifecycleStage(b),
        source: b.source.toLowerCase(),
        underInvestigation: b.underInvestigation,
        reviewCount: b.reviewCount,
        pendingClaims: b._count.claims,
        createdAt: b.createdAt,
      })),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  async businessDetail(id: string) {
    const b = await this.prisma.business.findUnique({
      where: { id },
      include: {
        category: { select: { slug: true, name: true } },
        identifiers: { orderBy: { createdAt: 'asc' } },
        locations: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
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
        mergedFrom: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!b) throw new NotFoundException('Business not found');
    const [duplicates, history] = await Promise.all([
      b.status === BusinessStatus.MERGED
        ? []
        : this.writer.findDuplicateCandidates({
            name: b.name,
            excludeBusinessId: b.id,
          }),
      this.audit.list({
        page: 1,
        limit: 20,
        targetType: 'business',
        targetId: b.id,
      }),
    ]);
    return {
      data: {
        ...b,
        status: b.status.toLowerCase(),
        ownershipStatus: b.ownershipStatus.toLowerCase(),
        lifecycleStage: lifecycleStage(b),
        locations: b.locations.map((l) => this.businesses.presentLocation(l)),
        rating: this.ratings.summary(b),
        managers: b.members.map((m) => ({
          ...m.user,
          role: m.role.toLowerCase(),
          since: m.createdAt,
        })),
        duplicateCandidates: duplicates,
        auditTrail: history.data,
        searchText: undefined,
        members: undefined,
      },
    };
  }

  /** PRD §6.2 channel 1: staff-created listings, with duplicate checks. */
  async createBusiness(actor: AuthUser, dto: CreateBusinessDto) {
    const categoryId = await this.writer.categoryIdBySlug(dto.category);
    const identifiers = this.writer.prepareIdentifiers([
      ...(dto.identifiers ?? []),
      ...this.writer.profileFieldIdentifiers(dto),
    ]);
    const similar = (
      await this.writer.findDuplicateCandidates({ name: dto.name, identifiers })
    ).filter((c) => c.status !== 'MERGED');
    if (similar.length && !dto.confirmNotDuplicate) {
      throw new ConflictException({
        message:
          'Possible duplicates found. Merge instead, or resend with confirmNotDuplicate: true.',
        duplicateCandidates: similar,
      });
    }
    const business = await this.prisma.$transaction(async (tx) => {
      const created = await this.writer.create(
        {
          ...dto,
          categoryId,
          status:
            dto.publish === false
              ? BusinessStatus.PENDING_REVIEW
              : BusinessStatus.PUBLISHED,
          source: BusinessSource.ADMIN,
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
          metadata: { name: created.name, status: created.status },
        },
        tx,
      );
      return created;
    });
    return this.businessDetail(business.id);
  }

  async updateBusiness(
    actor: AuthUser,
    id: string,
    dto: AdminUpdateBusinessDto,
  ) {
    const existing = await this.prisma.business.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Business not found');
    if (dto.publicPhone && !normalizeNigerianPhone(dto.publicPhone)) {
      throw new BadRequestException(
        'publicPhone must be a Nigerian phone number',
      );
    }
    const categoryId = dto.category
      ? await this.writer.categoryIdBySlug(dto.category)
      : undefined;
    await this.prisma.$transaction(async (tx) => {
      await this.writer.syncProfileIdentifiers(id, dto, tx);
      await tx.business.update({
        where: { id },
        data: {
          ...(dto.name ? { name: cleanText(dto.name) } : {}),
          ...(categoryId ? { categoryId } : {}),
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
        await this.writer.replaceLocations(id, dto.locations, tx);
      await this.writer.rebuildSearchText(id, tx);
      await this.audit.record(
        this.actor(actor),
        {
          action: 'business.update',
          targetType: 'business',
          targetId: id,
          metadata: {
            fields: Object.keys(dto),
            ...(dto.name && dto.name !== existing.name
              ? { renamedFrom: existing.name }
              : {}),
            ...(categoryId && categoryId !== existing.categoryId
              ? { categoryFrom: existing.categoryId }
              : {}),
          },
        },
        tx,
      );
    });
    return this.businessDetail(id);
  }

  async addIdentifier(actor: AuthUser, id: string, dto: IdentifierInputDto) {
    const created = await this.writer.addIdentifier(id, dto);
    await this.audit.record(this.actor(actor), {
      action: 'business.identifier_add',
      targetType: 'business',
      targetId: id,
      metadata: { type: created.type, value: created.normalizedValue },
    });
    return { data: created };
  }

  async removeIdentifier(actor: AuthUser, id: string, identifierId: string) {
    await this.writer.removeIdentifier(id, identifierId);
    await this.audit.record(this.actor(actor), {
      action: 'business.identifier_remove',
      targetType: 'business',
      targetId: id,
      metadata: { identifierId },
    });
    return { data: { message: 'Removed' } };
  }

  /** PRD §7.4 lifecycle moves: publish, suspend, archive, back to pending. */
  async setStatus(actor: AuthUser, id: string, dto: BusinessStatusDto) {
    const b = await this.prisma.business.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Business not found');
    if (b.status === BusinessStatus.MERGED)
      throw new BadRequestException('A merged listing cannot change status');
    const next = dto.status.toUpperCase() as BusinessStatus;
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
          metadata: { from: b.status, to: next, reason: dto.reason },
        },
        tx,
      );
    });
    return this.businessDetail(id);
  }

  async setInvestigation(actor: AuthUser, id: string, dto: InvestigationDto) {
    const b = await this.prisma.business.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Business not found');
    await this.prisma.business.update({
      where: { id },
      data: {
        underInvestigation: dto.underInvestigation,
        investigationNote: dto.underInvestigation
          ? dto.publicNote
            ? cleanText(dto.publicNote)
            : null
          : null,
      },
    });
    await this.audit.record(this.actor(actor), {
      action: dto.underInvestigation
        ? 'business.investigation_open'
        : 'business.investigation_close',
      targetType: 'business',
      targetId: id,
      metadata: { reason: dto.reason, publicNote: dto.publicNote ?? null },
    });
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
        excludeBusinessId: id,
      }),
    };
  }

  /** Platform-wide scan for likely duplicate pairs (PRD acceptance criterion 5). */
  async duplicateScan() {
    const pairs = await this.prisma.$queryRaw<
      {
        aId: string;
        aSlug: string;
        aName: string;
        bId: string;
        bSlug: string;
        bName: string;
        similarity: number;
      }[]
    >`
      SELECT a.id AS "aId", a.slug AS "aSlug", a.name AS "aName",
             b.id AS "bId", b.slug AS "bSlug", b.name AS "bName",
             similarity(lower(a.name), lower(b.name)) AS similarity
      FROM "Business" a
      JOIN "Business" b ON a.id < b.id AND lower(a.name) % lower(b.name)
      WHERE a.status NOT IN ('MERGED', 'ARCHIVED') AND b.status NOT IN ('MERGED', 'ARCHIVED')
        AND similarity(lower(a.name), lower(b.name)) > 0.5
      ORDER BY similarity DESC
      LIMIT 50`;
    return {
      data: pairs.map((p) => ({
        a: { id: p.aId, slug: p.aSlug, name: p.aName },
        b: { id: p.bId, slug: p.bSlug, name: p.bName },
        similarity: Math.round(p.similarity * 100) / 100,
      })),
    };
  }

  async merge(actor: AuthUser, sourceId: string, dto: MergeBusinessDto) {
    const result = await this.writer.merge(sourceId, dto.targetId);
    await this.audit.record(this.actor(actor), {
      action: 'business.merge',
      targetType: 'business',
      targetId: sourceId,
      metadata: {
        into: dto.targetId,
        reason: dto.reason,
        movedReviews: result.movedReviews,
      },
    });
    return { data: result };
  }

  // ───────────────────────────────────────────────────────────────── taxonomy

  async listTaxonomy() {
    const [categories, dimensions] = await Promise.all([
      this.prisma.businessCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          dimensions: {
            orderBy: { sortOrder: 'asc' },
            include: { dimension: true },
          },
          _count: { select: { businesses: true } },
        },
      }),
      this.prisma.ratingDimension.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return {
      data: {
        categories: categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          isActive: c.isActive,
          sortOrder: c.sortOrder,
          businessCount: c._count.businesses,
          dimensions: c.dimensions.map((d) => ({
            key: d.dimension.key,
            name: d.dimension.name,
            required: d.isRequired,
          })),
        })),
        dimensions,
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
        isRequired: d.required,
        sortOrder: i + 1,
      })),
    });
  }

  async createCategory(actor: AuthUser, dto: CreateCategoryDto) {
    if (
      await this.prisma.businessCategory.findUnique({
        where: { slug: dto.slug },
      })
    ) {
      throw new ConflictException('A category with this slug exists');
    }
    const category = await this.prisma.$transaction(async (tx) => {
      const c = await tx.businessCategory.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          description: dto.description ?? null,
          sortOrder: dto.sortOrder ?? 100,
          isActive: dto.isActive ?? true,
        },
      });
      if (dto.dimensions)
        await this.setCategoryDimensions(tx, c.id, dto.dimensions);
      await this.audit.record(
        this.actor(actor),
        {
          action: 'taxonomy.category_create',
          targetType: 'category',
          targetId: c.id,
          metadata: { slug: c.slug },
        },
        tx,
      );
      return c;
    });
    return { data: category };
  }

  /**
   * Changing a category's dimensions affects new reviews only; existing dimension scores stay
   * and remain in the breakdown while the dimension is attached to the category.
   */
  async updateCategory(actor: AuthUser, slug: string, dto: UpsertCategoryDto) {
    const existing = await this.prisma.businessCategory.findUnique({
      where: { slug },
    });
    if (!existing) throw new NotFoundException('Category not found');
    const category = await this.prisma.$transaction(async (tx) => {
      const c = await tx.businessCategory.update({
        where: { slug },
        data: {
          name: dto.name,
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      if (dto.dimensions)
        await this.setCategoryDimensions(tx, c.id, dto.dimensions);
      await this.audit.record(
        this.actor(actor),
        {
          action: 'taxonomy.category_update',
          targetType: 'category',
          targetId: c.id,
          metadata: { fields: Object.keys(dto) },
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
    ) {
      throw new ConflictException('A dimension with this key exists');
    }
    const d = await this.prisma.ratingDimension.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.record(this.actor(actor), {
      action: 'taxonomy.dimension_create',
      targetType: 'dimension',
      targetId: d.id,
      metadata: { key: d.key },
    });
    return { data: d };
  }

  async updateDimension(actor: AuthUser, key: string, dto: UpsertDimensionDto) {
    const existing = await this.prisma.ratingDimension.findUnique({
      where: { key },
    });
    if (!existing) throw new NotFoundException('Dimension not found');
    const d = await this.prisma.ratingDimension.update({
      where: { key },
      data: {
        name: dto.name,
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.record(this.actor(actor), {
      action: 'taxonomy.dimension_update',
      targetType: 'dimension',
      targetId: d.id,
      metadata: { fields: Object.keys(dto) },
    });
    return { data: d };
  }
}
