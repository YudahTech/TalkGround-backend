import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BusinessStatus,
  ClaimStatus,
  IdentifierType,
  MemberRole,
  OwnershipStatus,
  Prisma,
  VerificationMethod,
} from '@prisma/client';
import { promises as dns } from 'dns';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import {
  SOCIAL_IDENTIFIER_TYPES,
  normalizeDomain,
} from '../common/identifiers';
import { envFlag, hmacCode, safeEqualHex } from '../common/security';
import { cleanText, generateOtp } from '../common/utils';
import { pageMeta, skipTake } from '../common/pagination';
import type { AuthUser } from '../common/current-user.decorator';
import type {
  AddClaimDocumentDto,
  ApproveClaimDto,
  CreateClaimDto,
  RejectClaimDto,
  SetOwnershipDto,
} from './claims.dto';
import type {
  AdminClaimDetailDto,
  AdminClaimListItemDto,
  ClaimCreatedDto,
  ClaimDecisionDto,
  ClaimDto,
  ClaimInstructionsDto,
  DomainCheckDto,
  OwnershipChangeDto,
} from './claims.responses';

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_DOCUMENTS = 5;
/** Webmail domains: owning an address there proves nothing about a business. */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
]);

type ClaimRow = Prisma.BusinessClaimGetPayload<{
  include: { business: { include: { identifiers: true } }; documents: true };
}>;

/**
 * PRD v2.5 §7.5 ownership claims. Staff decide every claim. Approval sets ownershipStatus CLAIMED;
 * ownershipVerified is set only when the evidence was actually checked. Ownership never changes
 * ratings, ranking, indexing or any score.
 */
@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private audit: AuditService,
    private email: EmailService,
    private notify: NotificationsService,
    private uploads: UploadsService,
    private revalidate: RevalidationService,
  ) {}

  private get secret() {
    return this.config.get<string>('JWT_SECRET', 'dev-secret');
  }

  /** Deterministic per-claim token, so it can be shown again without being stored. */
  private derived(kind: 'domain' | 'social', claimId: string) {
    const mac = createHmac('sha256', this.secret)
      .update(`${kind}:${claimId}`)
      .digest('hex');
    return kind === 'domain'
      ? mac.slice(0, 32)
      : `TG-${mac.slice(0, 8).toUpperCase()}`;
  }

  private instructions(c: {
    id: string;
    method: VerificationMethod;
    verificationTarget: string | null;
  }): ClaimInstructionsDto {
    switch (c.method) {
      case VerificationMethod.BUSINESS_EMAIL:
        return {
          summary: `Enter the 6-digit code we emailed to ${c.verificationTarget}.`,
        };
      case VerificationMethod.WEBSITE_DOMAIN:
        return {
          summary: `Add this DNS TXT record to ${c.verificationTarget}, then press "Check domain".`,
          dnsRecord: {
            type: 'TXT',
            host: '@',
            value: `talkground-verification=${this.derived('domain', c.id)}`,
          },
        };
      case VerificationMethod.SOCIAL_ACCOUNT:
        return {
          summary: `Add the code ${this.derived('social', c.id)} to the bio of ${c.verificationTarget} until your claim is decided. Our team checks it.`,
          code: this.derived('social', c.id),
        };
      case VerificationMethod.DOCUMENTS:
        return {
          summary:
            'Upload documents that show you run this business (for example a CAC certificate or an invoice in the business name). Files are private and only seen by authorised TalkGround staff.',
        };
      default:
        return {
          summary:
            'Our team will review your request and may contact you for more information.',
        };
    }
  }

  private present(c: ClaimRow): ClaimDto {
    return {
      id: c.id,
      status: c.status.toLowerCase(),
      method: c.method.toLowerCase(),
      claimantRole: c.claimantRole,
      verificationTarget: c.verificationTarget,
      verificationConfirmed: !!c.verificationConfirmedAt,
      instructions:
        c.status === ClaimStatus.PENDING ? this.instructions(c) : null,
      documents: c.documents.map((d) => ({
        id: d.id,
        label: d.label,
        createdAt: d.createdAt,
      })),
      decisionReason: c.decisionReason,
      business: {
        id: c.business.id,
        slug: c.business.slug,
        name: c.business.name,
      },
      createdAt: c.createdAt,
      decidedAt: c.decidedAt,
    };
  }

  private async load(id: string): Promise<ClaimRow> {
    const claim = await this.prisma.businessClaim.findUnique({
      where: { id },
      include: {
        business: { include: { identifiers: true } },
        documents: true,
      },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  private async ownPending(user: AuthUser, id: string) {
    const claim = await this.load(id);
    if (claim.userId !== user.id)
      throw new ForbiddenException('This is not your claim');
    if (claim.status !== ClaimStatus.PENDING)
      throw new ConflictException('This claim was already decided');
    return claim;
  }

  /** The proof target must belong to the listing. */
  private resolveTarget(
    method: VerificationMethod,
    raw: string | undefined,
    identifiers: { type: IdentifierType; normalizedValue: string }[],
  ): string | null {
    const has = (type: IdentifierType, v: string) =>
      identifiers.some((i) => i.type === type && i.normalizedValue === v);
    switch (method) {
      case VerificationMethod.BUSINESS_EMAIL: {
        const email = raw?.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new BadRequestException(
            'verificationTarget must be the business email address',
          );
        }
        const domain = email.split('@')[1];
        if (
          !has(IdentifierType.EMAIL, email) &&
          !(
            !FREE_EMAIL_DOMAINS.has(domain) &&
            has(IdentifierType.WEBSITE, domain)
          )
        ) {
          throw new BadRequestException(
            "Use an email on the business's website domain or its listed email, or choose another method (for example social account).",
          );
        }
        return email;
      }
      case VerificationMethod.WEBSITE_DOMAIN: {
        const domain = raw ? normalizeDomain(raw) : null;
        if (!domain || !has(IdentifierType.WEBSITE, domain)) {
          throw new BadRequestException(
            "verificationTarget must be the business's listed website domain",
          );
        }
        return domain;
      }
      case VerificationMethod.SOCIAL_ACCOUNT: {
        const handle = raw?.trim().replace(/^@/, '').toLowerCase();
        const match = identifiers.find(
          (i) =>
            SOCIAL_IDENTIFIER_TYPES.includes(i.type) &&
            i.normalizedValue === handle,
        );
        if (!handle || !match) {
          throw new BadRequestException(
            "verificationTarget must be one of the business's listed social accounts",
          );
        }
        return `${match.type.toLowerCase()}:@${handle}`;
      }
      default:
        return null;
    }
  }

  private async sendEmailCode(
    claimId: string,
    email: string,
    businessName: string,
  ) {
    const code = generateOtp();
    await this.prisma.businessClaim.update({
      where: { id: claimId },
      data: {
        verificationSecretHash: hmacCode(code, this.secret),
        verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
        verificationAttempts: 0,
      },
    });
    const text = `Your TalkGround code to confirm you manage ${businessName} is ${code}. It expires in 15 minutes. If you did not request this, ignore this email.`;
    await this.email.send({
      to: email,
      subject: `TalkGround verification code: ${code}`,
      text,
      html: `<p>${text}</p>`,
    });
    return envFlag(this.config.get('EMAIL_DEV_MODE'), false)
      ? { devCode: code }
      : {};
  }

  // ───────────────────────────────────────────────────────────── claimant

  async create(
    user: AuthUser,
    businessId: string,
    dto: CreateClaimDto,
  ): Promise<{ data: ClaimCreatedDto }> {
    if (!user.emailVerified)
      throw new ForbiddenException('Verify your email address first');
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: { identifiers: true },
    });
    if (!business || business.status !== BusinessStatus.PUBLISHED)
      throw new NotFoundException('Business not found');
    const member = await this.prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId: user.id } },
    });
    if (member && !member.revokedAt)
      throw new ConflictException('You already manage this business');
    if (dto.method === VerificationMethod.MANUAL_REVIEW && !dto.message) {
      throw new BadRequestException(
        'Explain how you are connected to the business (message)',
      );
    }
    const target = this.resolveTarget(
      dto.method,
      dto.verificationTarget,
      business.identifiers,
    );
    let claimId: string;
    try {
      claimId = await this.prisma.$transaction(async (tx) => {
        const created = await tx.businessClaim.create({
          data: {
            businessId,
            userId: user.id,
            method: dto.method,
            claimantRole: cleanText(dto.claimantRole),
            message: dto.message ? cleanText(dto.message) : null,
            verificationTarget: target,
            pendingKey: `${businessId}:${user.id}`,
          },
        });
        if (business.ownershipStatus === OwnershipStatus.UNCLAIMED) {
          await tx.business.update({
            where: { id: businessId },
            data: { ownershipStatus: OwnershipStatus.CLAIM_PENDING },
          });
        }
        await this.audit.record(
          { id: user.id },
          {
            action: 'claim.submit',
            targetType: 'claim',
            targetId: created.id,
            after: {
              status: ClaimStatus.PENDING,
              method: dto.method,
              businessId,
            },
          },
          tx,
        );
        return created.id;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already have a pending claim for this business',
        );
      }
      throw err;
    }
    const extra =
      dto.method === VerificationMethod.BUSINESS_EMAIL
        ? await this.sendEmailCode(claimId, target!, business.name)
        : {};
    return {
      data: {
        ...this.present(await this.load(claimId)),
        ...extra,
        alreadyManaged: business.ownershipStatus === OwnershipStatus.CLAIMED,
      },
    };
  }

  async resendEmailCode(user: AuthUser, id: string) {
    const claim = await this.ownPending(user, id);
    if (claim.method !== VerificationMethod.BUSINESS_EMAIL)
      throw new BadRequestException(
        'This claim does not use email verification',
      );
    if (claim.verificationConfirmedAt)
      throw new BadRequestException('Email already confirmed');
    return {
      data: {
        message: 'Code sent',
        ...(await this.sendEmailCode(
          claim.id,
          claim.verificationTarget!,
          claim.business.name,
        )),
      },
    };
  }

  async confirmEmailCode(
    user: AuthUser,
    id: string,
    code: string,
  ): Promise<{ data: ClaimDto }> {
    const claim = await this.ownPending(user, id);
    if (
      claim.method !== VerificationMethod.BUSINESS_EMAIL ||
      !claim.verificationSecretHash
    ) {
      if (claim.verificationConfirmedAt) return { data: this.present(claim) };
      throw new BadRequestException('No code was sent for this claim');
    }
    if (
      !claim.verificationExpiresAt ||
      claim.verificationExpiresAt < new Date()
    ) {
      throw new BadRequestException('Code expired. Request a new one.');
    }
    if (claim.verificationAttempts >= MAX_CODE_ATTEMPTS)
      throw new BadRequestException('Too many wrong codes. Request a new one.');
    if (
      !safeEqualHex(claim.verificationSecretHash, hmacCode(code, this.secret))
    ) {
      await this.prisma.businessClaim.update({
        where: { id },
        data: { verificationAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect code');
    }
    await this.prisma.businessClaim.update({
      where: { id },
      data: {
        verificationConfirmedAt: new Date(),
        verificationSecretHash: null,
      },
    });
    return { data: this.present(await this.load(id)) };
  }

  /** Looks up the TXT record of the listed domain only, so it cannot be pointed at other hosts. */
  async checkDomain(
    user: AuthUser,
    id: string,
  ): Promise<{ data: DomainCheckDto }> {
    const claim = await this.ownPending(user, id);
    if (
      claim.method !== VerificationMethod.WEBSITE_DOMAIN ||
      !claim.verificationTarget
    ) {
      throw new BadRequestException(
        'This claim does not use domain verification',
      );
    }
    const expected = `talkground-verification=${this.derived('domain', claim.id)}`;
    let records: string[] = [];
    try {
      const result = await Promise.race([
        dns.resolveTxt(claim.verificationTarget),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000),
        ),
      ]);
      records = result.map((chunks) => chunks.join(''));
    } catch (err) {
      this.logger.warn(
        `TXT lookup failed for ${claim.verificationTarget}: ${String(err)}`,
      );
    }
    if (!records.some((r) => r.trim() === expected)) {
      return {
        data: {
          verified: false,
          message:
            'We could not find the TXT record yet. DNS changes can take up to an hour.',
          expected,
        },
      };
    }
    await this.prisma.businessClaim.update({
      where: { id },
      data: { verificationConfirmedAt: new Date() },
    });
    return {
      data: { verified: true, claim: this.present(await this.load(id)) },
    };
  }

  async addDocument(user: AuthUser, id: string, dto: AddClaimDocumentDto) {
    const claim = await this.ownPending(user, id);
    if (claim.documents.length >= MAX_DOCUMENTS)
      throw new BadRequestException(
        `At most ${MAX_DOCUMENTS} documents per claim`,
      );
    const asset = await this.uploads.verifyAsset(dto.url, 'claim-documents');
    const doc = await this.prisma.claimDocument.create({
      data: {
        claimId: id,
        label: cleanText(dto.label),
        url: asset.url,
        publicId: asset.publicId,
        format: asset.format,
      },
    });
    return { data: { id: doc.id, label: doc.label, createdAt: doc.createdAt } };
  }

  async getForClaimant(
    user: AuthUser,
    id: string,
  ): Promise<{ data: ClaimDto }> {
    const claim = await this.load(id);
    if (claim.userId !== user.id)
      throw new ForbiddenException('This is not your claim');
    return { data: this.present(claim) };
  }

  async mine(userId: string, page: number, limit: number) {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.businessClaim.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(page, limit),
        include: {
          business: { include: { identifiers: true } },
          documents: true,
        },
      }),
      this.prisma.businessClaim.count({ where }),
    ]);
    return {
      data: rows.map((c) => this.present(c)),
      meta: pageMeta(page, limit, total),
    };
  }

  /** CLAIM_PENDING drops back to UNCLAIMED when the last pending claim is rejected. */
  private async releasePendingOwnership(
    businessId: string,
    tx: Prisma.TransactionClient,
  ) {
    const b = await tx.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    if (b.ownershipStatus !== OwnershipStatus.CLAIM_PENDING) return;
    const open = await tx.businessClaim.count({
      where: { businessId, status: ClaimStatus.PENDING },
    });
    if (!open)
      await tx.business.update({
        where: { id: businessId },
        data: { ownershipStatus: OwnershipStatus.UNCLAIMED },
      });
  }

  // ──────────────────────────────────────────────────────────────── staff

  async list(
    status: string | undefined,
    page: number,
    limit: number,
  ): Promise<{
    data: AdminClaimListItemDto[];
    meta: ReturnType<typeof pageMeta>;
  }> {
    const where: Prisma.BusinessClaimWhereInput = {
      status: status
        ? (status.toUpperCase() as ClaimStatus)
        : ClaimStatus.PENDING,
    };
    const [rows, total] = await Promise.all([
      this.prisma.businessClaim.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...skipTake(page, limit),
        include: {
          business: { select: { id: true, slug: true, name: true } },
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
            },
          },
          _count: { select: { documents: true } },
        },
      }),
      this.prisma.businessClaim.count({ where }),
    ]);
    return {
      data: rows.map((c) => ({
        id: c.id,
        status: c.status.toLowerCase(),
        method: c.method.toLowerCase(),
        verificationConfirmed: !!c.verificationConfirmedAt,
        documentCount: c._count.documents,
        business: c.business,
        claimant: c.user,
        createdAt: c.createdAt,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  /** Claim for staff with claim.decide. Document links are 10-minute signed URLs; viewing is audited. */
  async detail(
    actor: AuthUser,
    id: string,
  ): Promise<{ data: AdminClaimDetailDto }> {
    const claim = await this.prisma.businessClaim.findUnique({
      where: { id },
      include: {
        business: { include: { identifiers: true } },
        documents: true,
        user: {
          select: { id: true, username: true, displayName: true, email: true },
        },
      },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.documents.length) {
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'claim.documents_view',
          targetType: 'claim',
          targetId: id,
          metadata: { documents: claim.documents.length },
        },
      );
    }
    const [otherClaims, members] = await Promise.all([
      this.prisma.businessClaim.findMany({
        where: { businessId: claim.businessId, id: { not: id } },
        select: {
          id: true,
          status: true,
          method: true,
          createdAt: true,
          user: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.businessMember.findMany({
        where: { businessId: claim.businessId, revokedAt: null },
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
      }),
    ]);
    return {
      data: {
        id: claim.id,
        status: claim.status.toLowerCase(),
        method: claim.method.toLowerCase(),
        claimantRole: claim.claimantRole,
        message: claim.message,
        claimant: claim.user,
        verification: {
          target: claim.verificationTarget,
          confirmedAt: claim.verificationConfirmedAt,
          ...(claim.method === VerificationMethod.SOCIAL_ACCOUNT
            ? { codeToLookFor: this.derived('social', claim.id) }
            : {}),
          ...(claim.method === VerificationMethod.WEBSITE_DOMAIN
            ? {
                expectedTxtRecord: `talkground-verification=${this.derived('domain', claim.id)}`,
              }
            : {}),
        },
        documents: claim.documents.map((d) => ({
          id: d.id,
          label: d.label,
          format: d.format,
          createdAt: d.createdAt,
          viewUrl: this.uploads.privateViewUrl(d.url),
        })),
        business: {
          id: claim.business.id,
          slug: claim.business.slug,
          name: claim.business.name,
          ownershipStatus: claim.business.ownershipStatus.toLowerCase(),
          ownershipVerified: claim.business.ownershipVerified,
          identifiers: claim.business.identifiers.map((i) => ({
            type: i.type.toLowerCase(),
            value: i.normalizedValue,
          })),
        },
        currentMembers: members.map((m) => m.user),
        otherClaims: otherClaims.map((c) => ({
          ...c,
          status: c.status.toLowerCase(),
          method: c.method.toLowerCase(),
        })),
        decisionReason: claim.decisionReason,
        createdAt: claim.createdAt,
      },
    };
  }

  async approve(
    actor: AuthUser,
    id: string,
    dto: ApproveClaimDto,
  ): Promise<{ data: ClaimDecisionDto }> {
    const claim = await this.load(id);
    if (claim.status !== ClaimStatus.PENDING)
      throw new ConflictException('This claim was already decided');
    const automated: VerificationMethod[] = [
      VerificationMethod.BUSINESS_EMAIL,
      VerificationMethod.WEBSITE_DOMAIN,
    ];
    if (
      dto.ownershipVerified &&
      automated.includes(claim.method) &&
      !claim.verificationConfirmedAt
    ) {
      throw new BadRequestException(
        'The claimant has not completed email/domain verification. Approve without verification, or wait.',
      );
    }
    if (
      dto.ownershipVerified &&
      claim.method === VerificationMethod.DOCUMENTS &&
      !claim.documents.length
    ) {
      throw new BadRequestException(
        'No documents were uploaded for this claim',
      );
    }
    const members = await this.prisma.businessMember.findMany({
      where: {
        businessId: claim.businessId,
        revokedAt: null,
        userId: { not: claim.userId },
      },
    });
    if (members.length && !dto.replaceExistingMembers) {
      throw new ConflictException(
        'Someone else already manages this business. Resend with replaceExistingMembers: true to transfer control.',
      );
    }
    const before = {
      ownershipStatus: claim.business.ownershipStatus,
      ownershipVerified: claim.business.ownershipVerified,
      claimStatus: claim.status,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.businessClaim.update({
        where: { id },
        data: {
          status: ClaimStatus.APPROVED,
          pendingKey: null,
          decisionReason: dto.reason,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      if (members.length) {
        await tx.businessMember.updateMany({
          where: { id: { in: members.map((m) => m.id) } },
          data: { revokedAt: new Date() },
        });
      }
      await tx.businessMember.upsert({
        where: {
          businessId_userId: {
            businessId: claim.businessId,
            userId: claim.userId,
          },
        },
        create: {
          businessId: claim.businessId,
          userId: claim.userId,
          role: MemberRole.OWNER,
          claimId: id,
        },
        update: { revokedAt: null, claimId: id, role: MemberRole.OWNER },
      });
      await tx.business.update({
        where: { id: claim.businessId },
        data: {
          ownershipStatus: OwnershipStatus.CLAIMED,
          ownershipVerified: dto.ownershipVerified,
        },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'claim.approve',
          targetType: 'claim',
          targetId: id,
          before,
          after: {
            ownershipStatus: OwnershipStatus.CLAIMED,
            ownershipVerified: dto.ownershipVerified,
            claimStatus: ClaimStatus.APPROVED,
          },
          reason: dto.reason,
          metadata: {
            businessId: claim.businessId,
            claimantId: claim.userId,
            revokedMembers: members.map((m) => m.userId),
          },
        },
        tx,
      );
    });
    void this.revalidate.business(claim.businessId);
    await this.notify.toUser(
      claim.userId,
      'claim.decision',
      `Your claim for ${claim.business.name} was approved`,
      [
        `Your claim for ${claim.business.name} was approved. You can now manage the profile, respond to reviews and see your dashboard.`,
      ],
      { label: 'Open your dashboard', path: `/dashboard/${claim.businessId}` },
    );
    return {
      data: {
        claimId: id,
        status: 'approved',
        ownershipStatus: 'claimed',
        ownershipVerified: dto.ownershipVerified,
      },
    };
  }

  async reject(
    actor: AuthUser,
    id: string,
    dto: RejectClaimDto,
  ): Promise<{ data: ClaimDecisionDto }> {
    const claim = await this.load(id);
    if (claim.status !== ClaimStatus.PENDING)
      throw new ConflictException('This claim was already decided');
    await this.prisma.$transaction(async (tx) => {
      await tx.businessClaim.update({
        where: { id },
        data: {
          status: ClaimStatus.REJECTED,
          pendingKey: null,
          decisionReason: dto.reason,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      await this.releasePendingOwnership(claim.businessId, tx);
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'claim.reject',
          targetType: 'claim',
          targetId: id,
          before: { claimStatus: claim.status },
          after: { claimStatus: ClaimStatus.REJECTED },
          reason: dto.reason,
          metadata: { businessId: claim.businessId },
        },
        tx,
      );
    });
    await this.notify.toUser(
      claim.userId,
      'claim.decision',
      `Your claim for ${claim.business.name} was not approved`,
      [
        `We could not approve your claim for ${claim.business.name}.`,
        `Reason: ${dto.reason}`,
        'You can submit a new claim with more information.',
      ],
      { label: 'View your claims', path: '/account/claims' },
    );
    return { data: { claimId: id, status: 'rejected' } };
  }

  /** Staff override of ownership (revoke access, or confirm verification later). */
  async setOwnership(
    actor: AuthUser,
    businessId: string,
    dto: SetOwnershipDto,
  ): Promise<{ data: OwnershipChangeDto }> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) throw new NotFoundException('Business not found');
    const members = await this.prisma.businessMember.count({
      where: { businessId, revokedAt: null },
    });
    if (dto.ownershipStatus === 'claimed' && !members)
      throw new BadRequestException(
        'Nobody manages this business. Approve a claim instead.',
      );
    if (dto.ownershipStatus === 'unclaimed' && dto.ownershipVerified)
      throw new BadRequestException(
        'An unclaimed business cannot be ownership-verified',
      );
    const next =
      dto.ownershipStatus === 'claimed'
        ? OwnershipStatus.CLAIMED
        : OwnershipStatus.UNCLAIMED;
    await this.prisma.$transaction(async (tx) => {
      if (next === OwnershipStatus.UNCLAIMED) {
        await tx.businessMember.updateMany({
          where: { businessId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.business.update({
        where: { id: businessId },
        data: {
          ownershipStatus: next,
          ownershipVerified: dto.ownershipVerified,
        },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'business.ownership_change',
          targetType: 'business',
          targetId: businessId,
          before: {
            ownershipStatus: business.ownershipStatus,
            ownershipVerified: business.ownershipVerified,
          },
          after: {
            ownershipStatus: next,
            ownershipVerified: dto.ownershipVerified,
          },
          reason: dto.reason,
        },
        tx,
      );
    });
    void this.revalidate.business(businessId);
    return {
      data: {
        businessId,
        ownershipStatus: next.toLowerCase(),
        ownershipVerified: dto.ownershipVerified,
      },
    };
  }
}
