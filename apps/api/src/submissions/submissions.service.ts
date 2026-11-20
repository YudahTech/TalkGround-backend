import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessStatus,
  IdentifierType,
  ListingSource,
  Prisma,
  SubmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessWriterService } from '../businesses/business-writer.service';
import { AuditService } from '../audit/audit.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { cleanText } from '../common/utils';
import { pageMeta, skipTake } from '../common/pagination';
import type { AuthUser } from '../common/current-user.decorator';
import type { IdentifierInputDto } from '../businesses/businesses.dto';
import type {
  ApproveSubmissionDto,
  CreateSubmissionDto,
  MergeSubmissionDto,
  RejectSubmissionDto,
} from './submissions.dto';
import type {
  AdminSubmissionDetailDto,
  AdminSubmissionDto,
  SubmissionCreatedDto,
  SubmissionDecisionDto,
  SubmissionDto,
} from './submissions.responses';

const DAILY_LIMIT = 5;
const INCLUDE = {
  category: { select: { slug: true, name: true } },
  city: { select: { slug: true, name: true, state: true } },
  business: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.BusinessSubmissionInclude;

type Row = Prisma.BusinessSubmissionGetPayload<{ include: typeof INCLUDE }>;

/**
 * PRD v2.5 §6.2 listing sources 2 and 3 (consumer suggestion, owner submission) and journey 3.
 * Nothing becomes public until staff approve it. Identifier matches are stored as possible
 * duplicates for staff; they never reject a submission automatically (§13).
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private writer: BusinessWriterService,
    private audit: AuditService,
    private revalidate: RevalidationService,
  ) {}

  private present(s: Row): SubmissionDto {
    return {
      id: s.id,
      source: s.source.toLowerCase(),
      name: s.name,
      category: s.category,
      description: s.description,
      website: s.website,
      city: s.city,
      area: s.area,
      onlineOnly: s.onlineOnly,
      identifiers:
        (s.identifiers as unknown as { type: string; value: string }[]) ?? [],
      ownerRole: s.ownerRole,
      status: s.status.toLowerCase(),
      adminNote: s.adminNote,
      business: s.business,
      createdAt: s.createdAt,
      reviewedAt: s.reviewedAt,
    };
  }

  async create(
    user: AuthUser,
    dto: CreateSubmissionDto,
  ): Promise<{ data: SubmissionCreatedDto }> {
    if (!user.emailVerified)
      throw new ForbiddenException('Verify your email address first');
    if (dto.isOwner && !dto.ownerRole)
      throw new BadRequestException(
        'ownerRole is required for an owner submission',
      );
    const recent = await this.prisma.businessSubmission.count({
      where: {
        submittedById: user.id,
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    });
    if (recent >= DAILY_LIMIT)
      throw new BadRequestException(
        `At most ${DAILY_LIMIT} submissions per 24 hours`,
      );

    const categoryId = await this.writer.categoryIdBySlug(dto.category);
    const location = await this.writer.resolveLocation(dto);
    const identifiers = this.writer.prepareIdentifiers([
      ...(dto.identifiers ?? []),
      ...(dto.website
        ? [{ type: IdentifierType.WEBSITE, value: dto.website }]
        : []),
    ]);
    const candidates = await this.writer.findDuplicateCandidates({
      name: dto.name,
      identifiers,
    });
    const submission = await this.prisma.businessSubmission.create({
      data: {
        source: dto.isOwner ? ListingSource.OWNER : ListingSource.CONSUMER,
        submittedById: user.id,
        name: cleanText(dto.name),
        categoryId,
        ...location,
        description: dto.description ? cleanText(dto.description) : null,
        website: dto.website ?? null,
        identifiers: identifiers.map((i) => ({ type: i.type, value: i.value })),
        ownerRole: dto.isOwner ? cleanText(dto.ownerRole!) : null,
        possibleDuplicateIds: candidates.map((c) => c.id),
      },
      include: INCLUDE,
    });
    return {
      data: {
        ...this.present(submission),
        message:
          'Thank you! Our team will check this business before it appears on TalkGround.',
        possibleMatches: candidates
          .filter((c) => c.status === 'published')
          .map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
      },
    };
  }

  async mine(userId: string, page: number, limit: number) {
    const where = { submittedById: userId };
    const [rows, total] = await Promise.all([
      this.prisma.businessSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(page, limit),
        include: INCLUDE,
      }),
      this.prisma.businessSubmission.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.present(r)),
      meta: pageMeta(page, limit, total),
    };
  }

  // ──────────────────────────────────────────────────────────────── staff

  private adminInclude = {
    ...INCLUDE,
    submittedBy: { select: { id: true, username: true, displayName: true } },
  };

  async list(
    status: string | undefined,
    page: number,
    limit: number,
  ): Promise<{
    data: AdminSubmissionDto[];
    meta: ReturnType<typeof pageMeta>;
  }> {
    const where: Prisma.BusinessSubmissionWhereInput = {
      status: status
        ? (status.toUpperCase() as SubmissionStatus)
        : SubmissionStatus.PENDING_REVIEW,
    };
    const [rows, total] = await Promise.all([
      this.prisma.businessSubmission.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...skipTake(page, limit),
        include: this.adminInclude,
      }),
      this.prisma.businessSubmission.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        ...this.present(r),
        submittedBy: r.submittedBy,
        possibleDuplicateIds: r.possibleDuplicateIds,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async detail(id: string): Promise<{ data: AdminSubmissionDetailDto }> {
    const s = await this.prisma.businessSubmission.findUnique({
      where: { id },
      include: this.adminInclude,
    });
    if (!s) throw new NotFoundException('Submission not found');
    const identifiers = this.writer.prepareIdentifiers(
      (s.identifiers as unknown as IdentifierInputDto[]) ?? [],
    );
    return {
      data: {
        ...this.present(s),
        submittedBy: s.submittedBy,
        possibleDuplicateIds: s.possibleDuplicateIds,
        duplicateCandidates: await this.writer.findDuplicateCandidates({
          name: s.name,
          identifiers,
        }),
      },
    };
  }

  private async pending(id: string) {
    const s = await this.prisma.businessSubmission.findUnique({
      where: { id },
    });
    if (!s) throw new NotFoundException('Submission not found');
    if (s.status !== SubmissionStatus.PENDING_REVIEW)
      throw new ConflictException('This submission was already decided');
    return s;
  }

  /** Approve: create the listing (SUGGESTED → PENDING_REVIEW → PUBLISHED, or kept in PENDING_REVIEW). */
  async approve(
    actor: AuthUser,
    id: string,
    dto: ApproveSubmissionDto,
  ): Promise<{ data: SubmissionDecisionDto }> {
    const s = await this.pending(id);
    const categoryId = dto.category
      ? await this.writer.categoryIdBySlug(dto.category)
      : s.categoryId;
    const business = await this.prisma.$transaction(async (tx) => {
      const created = await this.writer.create(
        {
          name: dto.name ?? s.name,
          categoryId,
          cityId: s.cityId,
          area: s.area,
          onlineOnly: s.onlineOnly,
          description: dto.description ?? s.description,
          website: s.website,
          identifiers: (
            (s.identifiers as unknown as IdentifierInputDto[]) ?? []
          ).filter((i) => i.type !== IdentifierType.WEBSITE),
          status:
            dto.publish === false
              ? BusinessStatus.PENDING_REVIEW
              : BusinessStatus.PUBLISHED,
          createdBySource: s.source,
          createdById: actor.id,
        },
        tx,
      );
      await tx.businessSubmission.update({
        where: { id },
        data: {
          status: SubmissionStatus.APPROVED,
          businessId: created.id,
          adminNote: dto.note ?? null,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'suggestion.approve',
          targetType: 'suggestion',
          targetId: id,
          before: { status: s.status },
          after: {
            status: SubmissionStatus.APPROVED,
            businessId: created.id,
            businessStatus: created.status,
          },
          reason: dto.note ?? null,
        },
        tx,
      );
      return created;
    });
    void this.revalidate.business(business.id);
    return {
      data: {
        submissionId: id,
        status: 'approved',
        business: { id: business.id, slug: business.slug, name: business.name },
      },
    };
  }

  async reject(
    actor: AuthUser,
    id: string,
    dto: RejectSubmissionDto,
  ): Promise<{ data: SubmissionDecisionDto }> {
    const s = await this.pending(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.businessSubmission.update({
        where: { id },
        data: {
          status: SubmissionStatus.REJECTED,
          adminNote: dto.note,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'suggestion.reject',
          targetType: 'suggestion',
          targetId: id,
          before: { status: s.status },
          after: { status: SubmissionStatus.REJECTED },
          reason: dto.note,
        },
        tx,
      );
    });
    return { data: { submissionId: id, status: 'rejected', business: null } };
  }

  /** The submission duplicates an existing listing: add its identifiers there instead. */
  async merge(
    actor: AuthUser,
    id: string,
    dto: MergeSubmissionDto,
  ): Promise<{ data: SubmissionDecisionDto }> {
    const s = await this.pending(id);
    const target = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
    });
    if (
      !target ||
      (target.status !== BusinessStatus.PUBLISHED &&
        target.status !== BusinessStatus.SUSPENDED)
    ) {
      throw new BadRequestException(
        'The existing listing must be published or suspended',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      for (const ident of this.writer.prepareIdentifiers(
        (s.identifiers as unknown as IdentifierInputDto[]) ?? [],
      )) {
        await tx.businessIdentifier.upsert({
          where: {
            businessId_type_normalizedValue: {
              businessId: target.id,
              type: ident.type,
              normalizedValue: ident.normalizedValue,
            },
          },
          create: { ...ident, businessId: target.id },
          update: {},
        });
      }
      await this.writer.rebuildSearchText(target.id, tx);
      await tx.businessSubmission.update({
        where: { id },
        data: {
          status: SubmissionStatus.MERGED,
          businessId: target.id,
          adminNote: dto.note ?? null,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'suggestion.merge',
          targetType: 'suggestion',
          targetId: id,
          before: { status: s.status },
          after: { status: SubmissionStatus.MERGED, businessId: target.id },
          reason: dto.note ?? null,
        },
        tx,
      );
    });
    return {
      data: {
        submissionId: id,
        status: 'merged',
        business: { id: target.id, slug: target.slug, name: target.name },
      },
    };
  }
}
