import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BrandStatus,
  MediaType,
  Prisma,
  ReportStatus,
  ReviewStatus,
  SuggestionStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBrandDto, UpdateBrandDto } from '../brands/brands.dto';
import { slugify } from '../common/utils';
import { AuditActor, AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { UploadsService } from '../uploads/uploads.service';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  role: true,
  emailVerified: true,
  phoneVerified: true,
  suspended: true,
  suspendedReason: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private auth: AuthService,
    private uploads: UploadsService,
  ) {}

  async dashboard() {
    const [
      brands,
      reviews,
      users,
      pendingSuggestions,
      flaggedReviews,
      pendingReceiptVerifications,
      reportedReviews,
    ] = await Promise.all([
      this.prisma.brand.count({ where: { status: BrandStatus.ACTIVE } }),
      this.prisma.review.count({
        where: { status: { not: ReviewStatus.REMOVED } },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.brandSuggestion.count({
        where: { status: SuggestionStatus.PENDING },
      }),
      this.prisma.review.count({ where: { status: ReviewStatus.FLAGGED } }),
      this.prisma.review.count({
        where: { status: ReviewStatus.PENDING_VERIFICATION },
      }),
      this.prisma.reviewReport.count({ where: { status: ReportStatus.OPEN } }),
    ]);

    return {
      data: {
        brands,
        reviews,
        users,
        pendingSuggestions,
        flaggedReviews,
        pendingReceiptVerifications,
        reportedReviews,
      },
    };
  }

  // ------------------------------------------------------------------ brands

  async listBrands() {
    const brands = await this.prisma.brand.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { data: brands };
  }

  private async uniqueSlug(name: string, preferred?: string): Promise<string> {
    const base = slugify(preferred || name) || 'brand';
    let slug = base;
    for (
      let i = 2;
      await this.prisma.brand.findUnique({ where: { slug } });
      i++
    ) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  async createBrand(actor: AuditActor, dto: CreateBrandDto) {
    const existing = await this.prisma.brand.findUnique({
      where: { slug: dto.slug },
    });
    if (existing)
      throw new ConflictException(`Slug "${dto.slug}" is already used`);
    const brand = await this.prisma.brand.create({ data: dto });
    await this.audit.record(actor, {
      action: 'brand.create',
      targetType: 'brand',
      targetId: brand.id,
      metadata: { name: brand.name, slug: brand.slug },
    });
    return { data: brand };
  }

  async updateBrand(actor: AuditActor, id: string, dto: UpdateBrandDto) {
    const existing = await this.prisma.brand.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Brand not found');
    const brand = await this.prisma.brand.update({ where: { id }, data: dto });

    const changes = Object.fromEntries(
      Object.entries(dto)
        .filter(
          ([key, value]) =>
            value !== undefined &&
            value !== (existing as Record<string, unknown>)[key],
        )
        .map(([key, value]) => [
          key,
          { from: (existing as Record<string, unknown>)[key], to: value },
        ]),
    );
    await this.audit.record(actor, {
      action: 'brand.update',
      targetType: 'brand',
      targetId: id,
      metadata: changes,
    });
    return { data: brand };
  }

  async deactivateBrand(actor: AuditActor, id: string) {
    const existing = await this.prisma.brand.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Brand not found');
    const brand = await this.prisma.brand.update({
      where: { id },
      data: { status: BrandStatus.INACTIVE },
    });
    await this.audit.record(actor, {
      action: 'brand.deactivate',
      targetType: 'brand',
      targetId: id,
    });
    return { data: brand };
  }

  // ----------------------------------------------------------------- reviews

  async reviewQueue(queue: string) {
    let where: Prisma.ReviewWhereInput = {};
    if (queue === 'reported') {
      where = { reports: { some: { status: ReportStatus.OPEN } } };
    } else if (queue === 'flagged') {
      where = { status: ReviewStatus.FLAGGED };
    } else if (queue === 'pending_receipt') {
      where = { status: ReviewStatus.PENDING_VERIFICATION };
    } else if (queue === 'suspended') {
      where = { status: ReviewStatus.SUSPENDED };
    }

    const reviews = await this.prisma.review.findMany({
      where,
      include: {
        user: {
          select: {
            displayName: true,
            username: true,
            email: true,
            createdAt: true,
          },
        },
        brand: { select: { name: true, slug: true } },
        flags: true,
        reports: { where: { status: ReportStatus.OPEN } },
        media: true,
        _count: { select: { revisions: true } },
      },
      orderBy: { createdAt: 'asc' }, // oldest first: work the SLA queue in order
    });

    // Receipts are private: moderators get a signed view URL, never the raw stored URL.
    return {
      data: reviews.map((r) => ({
        ...r,
        ipHash: undefined,
        textHash: undefined,
        media: r.media.map((m) =>
          m.type === MediaType.RECEIPT
            ? { ...m, url: this.uploads.privateViewUrl(m.url) }
            : m,
        ),
      })),
    };
  }

  async reviewRevisions(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    const revisions = await this.prisma.reviewRevision.findMany({
      where: { reviewId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { data: revisions };
  }

  async moderateReview(
    actor: AuditActor,
    id: string,
    action: string,
    note?: string,
    approved?: boolean,
  ) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');

    const closeReports = (status: ReportStatus) =>
      this.prisma.reviewReport.updateMany({
        where: { reviewId: id, status: ReportStatus.OPEN },
        data: { status },
      });

    if (action === 'approve') {
      await this.prisma.$transaction([
        this.prisma.review.update({
          where: { id },
          data: { status: ReviewStatus.PUBLISHED },
        }),
        closeReports(ReportStatus.DISMISSED),
      ]);
    } else if (action === 'suspend') {
      await this.prisma.$transaction([
        this.prisma.review.update({
          where: { id },
          data: { status: ReviewStatus.SUSPENDED },
        }),
        closeReports(ReportStatus.ACTIONED),
      ]);
    } else if (action === 'remove') {
      await this.prisma.$transaction([
        this.prisma.review.update({
          where: { id },
          data: { status: ReviewStatus.REMOVED },
        }),
        closeReports(ReportStatus.ACTIONED),
      ]);
    } else if (action === 'dismiss_report') {
      await closeReports(ReportStatus.DISMISSED);
    } else if (action === 'verify_receipt') {
      if (approved === undefined) {
        throw new BadRequestException('approved field required');
      }
      const hasReceipt = await this.prisma.reviewMedia.count({
        where: { reviewId: id, type: MediaType.RECEIPT },
      });
      if (!hasReceipt)
        throw new BadRequestException('This review has no receipt');
      await this.prisma.review.update({
        where: { id },
        data: { verifiedVisit: approved, status: ReviewStatus.PUBLISHED },
      });
    } else {
      throw new BadRequestException('Unknown action');
    }

    await this.audit.record(actor, {
      action: `review.${action}`,
      targetType: 'review',
      targetId: id,
      metadata: { previousStatus: review.status, note, approved },
    });

    return { data: { message: `Action ${action} applied` } };
  }

  // ------------------------------------------------------------- suggestions

  /** Active brands in the same city whose name overlaps the suggestion (PRD L-3). */
  private async possibleDuplicates(name: string, city: string) {
    const words = name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (w) =>
          w.length >= 3 &&
          !['the', 'and', 'restaurant', 'hotel', 'lounge', 'suites'].includes(
            w,
          ),
      );
    const or: Prisma.BrandWhereInput[] = [
      { name: { contains: name.trim(), mode: 'insensitive' } },
      { slug: slugify(name) },
      ...words.map((w) => ({
        name: { contains: w, mode: 'insensitive' as const },
      })),
    ];
    return this.prisma.brand.findMany({
      where: { city: city as Prisma.BrandWhereInput['city'], OR: or },
      select: { id: true, name: true, slug: true, area: true, status: true },
      take: 5,
    });
  }

  async listSuggestions() {
    const suggestions = await this.prisma.brandSuggestion.findMany({
      where: { status: SuggestionStatus.PENDING },
      include: {
        user: { select: { displayName: true, username: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const data = await Promise.all(
      suggestions.map(async (s) => ({
        ...s,
        possibleDuplicates: await this.possibleDuplicates(s.name, s.city),
      })),
    );
    return { data };
  }

  async resolveSuggestion(
    actor: AuditActor,
    id: string,
    status: 'approved' | 'rejected',
    adminNote?: string,
  ) {
    const suggestion = await this.prisma.brandSuggestion.findUnique({
      where: { id },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.status !== SuggestionStatus.PENDING) {
      throw new ConflictException('This suggestion was already resolved');
    }

    let brandId: string | undefined;
    if (status === 'approved') {
      const brand = await this.prisma.brand.create({
        data: {
          name: suggestion.name,
          slug: await this.uniqueSlug(suggestion.name),
          category: suggestion.category,
          subType: suggestion.subType,
          city: suggestion.city,
          area: suggestion.area,
          website: suggestion.website,
        },
      });
      brandId = brand.id;
    }

    const updated = await this.prisma.brandSuggestion.update({
      where: { id },
      data: {
        status:
          status === 'approved'
            ? SuggestionStatus.APPROVED
            : SuggestionStatus.REJECTED,
        adminNote,
      },
    });

    await this.audit.record(actor, {
      action: `suggestion.${status}`,
      targetType: 'suggestion',
      targetId: id,
      metadata: { name: suggestion.name, brandId, adminNote },
    });

    return { data: { ...updated, brandId } };
  }

  async suggestBrand(
    userId: string,
    dto: {
      name: string;
      category: string;
      subType?: string;
      city: string;
      area: string;
      website?: string;
    },
  ) {
    const suggestion = await this.prisma.brandSuggestion.create({
      data: {
        userId,
        name: dto.name,
        category: dto.category as 'RESTAURANTS' | 'HOTELS',
        subType: dto.subType,
        city: dto.city as 'LAGOS' | 'ABUJA',
        area: dto.area,
        website: dto.website,
      },
    });
    const possibleDuplicates = await this.possibleDuplicates(
      dto.name,
      dto.city,
    );
    return { data: { ...suggestion, possibleDuplicates } };
  }

  // ------------------------------------------------------------------- users

  async listUsers(params: { q?: string; page: number; limit: number }) {
    const where: Prisma.UserWhereInput = params.q
      ? {
          OR: [
            { email: { contains: params.q, mode: 'insensitive' } },
            { username: { contains: params.q, mode: 'insensitive' } },
            { displayName: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          ...SAFE_USER_SELECT,
          _count: { select: { reviews: true, reports: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
    ]);
    return {
      data: users,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async suspendUser(
    actor: AuditActor,
    id: string,
    suspended: boolean,
    reason: string,
  ) {
    if (id === actor.id)
      throw new BadRequestException('You cannot suspend your own account');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const user = await this.prisma.user.update({
      where: { id },
      data: { suspended, suspendedReason: suspended ? reason : null },
      select: SAFE_USER_SELECT,
    });
    if (suspended) await this.auth.revokeAllSessions(id);

    await this.audit.record(actor, {
      action: suspended ? 'user.suspend' : 'user.unsuspend',
      targetType: 'user',
      targetId: id,
      metadata: { reason },
    });
    return { data: user };
  }

  async setRole(actor: AuditActor, id: string, role: UserRole) {
    if (id === actor.id)
      throw new BadRequestException('You cannot change your own role');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const user = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: SAFE_USER_SELECT,
    });
    // Force fresh tokens so the new permissions apply everywhere immediately.
    await this.auth.revokeAllSessions(id);

    await this.audit.record(actor, {
      action: 'user.role_change',
      targetType: 'user',
      targetId: id,
      metadata: { from: target.role, to: role },
    });
    return { data: user };
  }

  listAuditLogs(params: {
    page: number;
    limit: number;
    targetType?: string;
    targetId?: string;
    actorId?: string;
  }) {
    return this.audit.list(params);
  }
}
