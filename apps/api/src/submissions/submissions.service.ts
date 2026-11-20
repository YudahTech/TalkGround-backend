import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessSource,
  BusinessStatus,
  IdentifierType,
  Prisma,
  SubmissionSource,
  SubmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessWriterService } from '../businesses/business-writer.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeState } from '../common/nigeria';
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

const DAILY_LIMIT = 5;

/**
 * PRD §6.2 channels 2 and 3 (consumer suggestions, owner submissions) and journey §9.3.
 * Nothing becomes public until a staff member approves it (PRD §6.2 "appropriate checks").
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private writer: BusinessWriterService,
    private audit: AuditService,
    private notify: NotificationsService,
  ) {}

  private present(
    s: Prisma.BusinessSubmissionGetPayload<{
      include: {
        category: true;
        business: { select: { slug: true; name: true } };
      };
    }>,
  ) {
    return {
      id: s.id,
      source: s.source.toLowerCase(),
      name: s.name,
      category: { slug: s.category.slug, name: s.category.name },
      description: s.description,
      website: s.website,
      location: {
        state: s.state,
        city: s.city,
        area: s.area,
        addressLine: s.addressLine,
      },
      identifiers: s.identifiers,
      ownerRole: s.ownerRole,
      status: s.status.toLowerCase(),
      reviewNote: s.reviewNote,
      business: s.business,
      createdAt: s.createdAt,
      reviewedAt: s.reviewedAt,
    };
  }

  async create(user: AuthUser, dto: CreateSubmissionDto) {
    if (!user.emailVerified) {
      throw new ForbiddenException('Verify your email address first');
    }
    if (dto.isOwner && !dto.ownerRole) {
      throw new BadRequestException(
        'ownerRole is required for an owner submission',
      );
    }
    const recent = await this.prisma.businessSubmission.count({
      where: {
        submittedById: user.id,
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    });
    if (recent >= DAILY_LIMIT) {
      throw new BadRequestException(
        `At most ${DAILY_LIMIT} submissions per 24 hours`,
      );
    }

    const categoryId = await this.writer.categoryIdBySlug(dto.category);
    const state = dto.state ? normalizeState(dto.state) : null;
    if (dto.state && !state) {
      throw new BadRequestException(`Unknown Nigerian state: ${dto.state}`);
    }
    const identifierInput: IdentifierInputDto[] = [
      ...(dto.identifiers ?? []),
      ...(dto.website
        ? [{ type: IdentifierType.WEBSITE, value: dto.website }]
        : []),
    ];
    const identifiers = this.writer.prepareIdentifiers(identifierInput);

    // Strong duplicate: a unique identifier already belongs to a live listing → send them there.
    const conflicts = await this.writer.identifierConflicts(identifiers);
    const live = conflicts.find(
      (c) => c.business.status === BusinessStatus.PUBLISHED,
    );
    if (live) {
      throw new ConflictException({
        message: `This business is already on TalkGround as "${live.business.name}"`,
        business: { slug: live.business.slug, name: live.business.name },
      });
    }

    const submission = await this.prisma.businessSubmission.create({
      data: {
        source: dto.isOwner
          ? SubmissionSource.OWNER_SUBMISSION
          : SubmissionSource.CONSUMER_SUGGESTION,
        submittedById: user.id,
        name: cleanText(dto.name),
        categoryId,
        description: dto.description ? cleanText(dto.description) : null,
        website: dto.website ?? null,
        state,
        city: dto.city ? cleanText(dto.city) : null,
        area: dto.area ? cleanText(dto.area) : null,
        addressLine: dto.addressLine ? cleanText(dto.addressLine) : null,
        identifiers: identifiers.map((i) => ({ type: i.type, value: i.value })),
        ownerRole: dto.isOwner ? cleanText(dto.ownerRole!) : null,
      },
      include: {
        category: true,
        business: { select: { slug: true, name: true } },
      },
    });
    const similar = await this.writer.findDuplicateCandidates({
      name: dto.name,
      identifiers,
    });
    return {
      data: {
        ...this.present(submission),
        message:
          'Thanks! Our team will check this business before it appears on TalkGround.',
        possibleMatches: similar
          .filter((c) => c.status === BusinessStatus.PUBLISHED)
          .map((c) => ({ slug: c.slug, name: c.name })),
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
        include: {
          category: true,
          business: { select: { slug: true, name: true } },
        },
      }),
      this.prisma.businessSubmission.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.present(r)),
      meta: pageMeta(page, limit, total),
    };
  }

  // ──────────────────────────────────────────────────────────────── staff

  async list(status: string | undefined, page: number, limit: number) {
    const where: Prisma.BusinessSubmissionWhereInput = {
      status:
        (status?.toUpperCase() as SubmissionStatus) ??
        SubmissionStatus.PENDING_REVIEW,
    };
    const [rows, total] = await Promise.all([
      this.prisma.businessSubmission.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...skipTake(page, limit),
        include: {
          category: true,
          business: { select: { slug: true, name: true } },
          submittedBy: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.businessSubmission.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        ...this.present(r),
        submittedBy: r.submittedBy,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  private async pending(id: string) {
    const s = await this.prisma.businessSubmission.findUnique({
      where: { id },
    });
    if (!s) throw new NotFoundException('Submission not found');
    if (s.status !== SubmissionStatus.PENDING_REVIEW) {
      throw new ConflictException('This submission was already decided');
    }
    return s;
  }

  /** Staff view of one submission with duplicate candidates (PRD §8.1 "duplicate listing resolution"). */
  async detail(id: string) {
    const s = await this.prisma.businessSubmission.findUnique({
      where: { id },
      include: {
        category: true,
        business: { select: { slug: true, name: true } },
        submittedBy: {
          select: { id: true, username: true, displayName: true, email: true },
        },
      },
    });
    if (!s) throw new NotFoundException('Submission not found');
    const identifiers = this.writer.prepareIdentifiers(
      (s.identifiers as unknown as IdentifierInputDto[]) ?? [],
    );
    return {
      data: {
        ...this.present(s),
        submittedBy: s.submittedBy,
        duplicateCandidates: await this.writer.findDuplicateCandidates({
          name: s.name,
          identifiers,
        }),
      },
    };
  }

  async approve(actor: AuthUser, id: string, dto: ApproveSubmissionDto) {
    const s = await this.pending(id);
    const categoryId = dto.category
      ? await this.writer.categoryIdBySlug(dto.category)
      : s.categoryId;
    const business = await this.prisma.$transaction(async (tx) => {
      const created = await this.writer.create(
        {
          name: dto.name ?? s.name,
          categoryId,
          description: s.description,
          website: s.website,
          identifiers: (
            (s.identifiers as unknown as IdentifierInputDto[]) ?? []
          ).filter((i) => i.type !== IdentifierType.WEBSITE),
          locations: s.state
            ? [
                {
                  state: s.state,
                  city: s.city ?? undefined,
                  area: s.area ?? undefined,
                  addressLine: s.addressLine ?? undefined,
                },
              ]
            : [],
          status:
            dto.publish === false
              ? BusinessStatus.PENDING_REVIEW
              : BusinessStatus.PUBLISHED,
          source:
            s.source === SubmissionSource.OWNER_SUBMISSION
              ? BusinessSource.OWNER_SUBMISSION
              : BusinessSource.CONSUMER_SUGGESTION,
          createdById: actor.id,
        },
        tx,
      );
      await tx.businessSubmission.update({
        where: { id },
        data: {
          status: SubmissionStatus.APPROVED,
          businessId: created.id,
          reviewNote: dto.note ?? null,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'submission.approve',
          targetType: 'submission',
          targetId: id,
          metadata: { businessId: created.id },
        },
        tx,
      );
      return created;
    });

    await this.notify.toUser(
      s.submittedById,
      `${business.name} is now on TalkGround`,
      s.source === SubmissionSource.OWNER_SUBMISSION
        ? [
            `Your business ${business.name} was approved and is now listed.`,
            'To manage the profile and respond to reviews, open the listing and claim it. Claiming asks you to prove you control the business.',
          ]
        : [
            `Thanks for suggesting ${business.name}. It is now listed on TalkGround.`,
          ],
      { label: 'View the listing', path: `/businesses/${business.slug}` },
    );
    return {
      data: {
        submissionId: id,
        status: 'approved',
        business: { id: business.id, slug: business.slug, name: business.name },
      },
    };
  }

  async reject(actor: AuthUser, id: string, dto: RejectSubmissionDto) {
    const s = await this.pending(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.businessSubmission.update({
        where: { id },
        data: {
          status: SubmissionStatus.REJECTED,
          reviewNote: dto.note,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'submission.reject',
          targetType: 'submission',
          targetId: id,
          metadata: { note: dto.note },
        },
        tx,
      );
    });
    await this.notify.toUser(
      s.submittedById,
      `About your suggestion: ${s.name}`,
      [
        `We reviewed your submission for ${s.name} and could not add it.`,
        `Reason: ${dto.note}`,
      ],
    );
    return { data: { submissionId: id, status: 'rejected' } };
  }

  /** The submission duplicates an existing listing: add its new identifiers there instead. */
  async merge(actor: AuthUser, id: string, dto: MergeSubmissionDto) {
    const s = await this.pending(id);
    const target = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
    });
    if (
      !target ||
      target.status === BusinessStatus.MERGED ||
      target.status === BusinessStatus.ARCHIVED
    ) {
      throw new BadRequestException('Target must be an active listing');
    }
    const added: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const ident of (s.identifiers as unknown as IdentifierInputDto[]) ??
        []) {
        const [prepared] = this.writer.prepareIdentifiers([ident]);
        const conflicts = await this.writer.identifierConflicts(
          [prepared],
          target.id,
          tx,
        );
        const exists = await tx.businessIdentifier.findFirst({
          where: {
            businessId: target.id,
            type: prepared.type,
            normalizedValue: prepared.normalizedValue,
          },
        });
        if (!conflicts.length && !exists) {
          await tx.businessIdentifier.create({
            data: { ...prepared, businessId: target.id },
          });
          added.push(`${prepared.type}:${prepared.normalizedValue}`);
        }
      }
      if (added.length) await this.writer.rebuildSearchText(target.id, tx);
      await tx.businessSubmission.update({
        where: { id },
        data: {
          status: SubmissionStatus.MERGED,
          businessId: target.id,
          reviewNote: dto.note ?? null,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'submission.merge',
          targetType: 'submission',
          targetId: id,
          metadata: { businessId: target.id, addedIdentifiers: added },
        },
        tx,
      );
    });
    await this.notify.toUser(
      s.submittedById,
      `${target.name} is already on TalkGround`,
      [
        `The business you suggested (${s.name}) is already listed as ${target.name}. We added the details you sent to that listing.`,
      ],
      { label: 'View the listing', path: `/businesses/${target.slug}` },
    );
    return {
      data: {
        submissionId: id,
        status: 'merged',
        business: { id: target.id, slug: target.slug, name: target.name },
        addedIdentifiers: added,
      },
    };
  }
}
