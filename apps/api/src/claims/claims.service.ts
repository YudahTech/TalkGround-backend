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
  AdminPermission,
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

type ClaimWithBusiness = Prisma.BusinessClaimGetPayload<{
  include: { business: { include: { identifiers: true } }; documents: true };
}>;

/** PRD §7.5 ownership claims. Approval always needs a staff decision (step 5 "TalkGround reviews"). */
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

  private instructions(claim: {
    id: string;
    method: VerificationMethod;
    verificationTarget: string | null;
  }) {
    switch (claim.method) {
      case VerificationMethod.BUSINESS_EMAIL:
        return {
          summary: `Enter the 6-digit code we emailed to ${claim.verificationTarget}.`,
        };
      case VerificationMethod.WEBSITE_DOMAIN:
        return {
          summary: `Add this DNS TXT record to ${claim.verificationTarget}, then press "Check domain".`,
          dnsRecord: {
            type: 'TXT',
            host: '@',
            value: `talkground-verification=${this.derived('domain', claim.id)}`,
          },
        };
      case VerificationMethod.SOCIAL_ACCOUNT:
        return {
          summary: `Add the code ${this.derived('social', claim.id)} to the bio of ${claim.verificationTarget} until we confirm your claim. Our team checks it manually.`,
          code: this.derived('social', claim.id),
        };
      case VerificationMethod.DOCUMENTS:
        return {
          summary:
            'Upload documents that show you run this business (e.g. CAC certificate, utility bill in the business name). Files are private and only seen by authorised TalkGround staff.',
        };
      default:
        return {
          summary:
            'Our team will review your request and may contact you for more information.',
        };
    }
  }

  private presentForClaimant(c: ClaimWithBusiness) {
    return {
      id: c.id,
      status: c.status.toLowerCase(),
      method: c.method.toLowerCase(),
      claimantRole: c.claimantRole,
      verificationTarget: c.verificationTarget,
      verified: !!c.verificationConfirmedAt,
      verifiedAt: c.verificationConfirmedAt,
      instructions:
        c.status === ClaimStatus.PENDING ? this.instructions(c) : null,
      documents: c.documents.map((d) => ({
        id: d.id,
        label: d.label,
        createdAt: d.createdAt,
      })),
      decisionNote: c.status === ClaimStatus.PENDING ? null : c.decisionNote,
      business: {
        id: c.business.id,
        slug: c.business.slug,
        name: c.business.name,
      },
      createdAt: c.createdAt,
      reviewedAt: c.reviewedAt,
    };
  }

  private async load(id: string): Promise<ClaimWithBusiness> {
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
    if (claim.claimantId !== user.id)
      throw new ForbiddenException('This is not your claim');
    if (claim.status !== ClaimStatus.PENDING)
      throw new ConflictException('This claim is closed');
    return claim;
  }

  /** Validate that the proof target actually belongs to the listing. */
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
        const listedEmail = has(IdentifierType.EMAIL, email);
        const websiteDomain =
          !FREE_EMAIL_DOMAINS.has(domain) &&
          has(IdentifierType.WEBSITE, domain);
        if (!listedEmail && !websiteDomain) {
          throw new BadRequestException(
            "Use an email address on the business's website domain, or the business's listed public email. Otherwise choose another verification method.",
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

  async create(user: AuthUser, businessId: string, dto: CreateClaimDto) {
    if (!user.emailVerified)
      throw new ForbiddenException('Verify your email address first');
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: { identifiers: true },
    });
    if (!business || business.status !== BusinessStatus.PUBLISHED) {
      throw new NotFoundException('Business not found');
    }
    const alreadyManager = await this.prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId: user.id } },
    });
    if (alreadyManager && !alreadyManager.revokedAt) {
      throw new ConflictException('You already manage this business');
    }
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

    let claim;
    try {
      claim = await this.prisma.$transaction(async (tx) => {
        const created = await tx.businessClaim.create({
          data: {
            businessId,
            claimantId: user.id,
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
        return created;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already have an open claim for this business',
        );
      }
      throw err;
    }
    const extra =
      dto.method === VerificationMethod.BUSINESS_EMAIL
        ? await this.sendEmailCode(claim.id, target!, business.name)
        : {};
    const full = await this.load(claim.id);
    return {
      data: {
        ...this.presentForClaimant(full),
        ...extra,
        alreadyManaged:
          business.ownershipStatus === OwnershipStatus.CLAIMED ||
          business.ownershipStatus === OwnershipStatus.VERIFIED,
      },
    };
  }

  async resendEmailCode(user: AuthUser, id: string) {
    const claim = await this.ownPending(user, id);
    if (claim.method !== VerificationMethod.BUSINESS_EMAIL) {
      throw new BadRequestException(
        'This claim does not use email verification',
      );
    }
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

  async confirmEmailCode(user: AuthUser, id: string, code: string) {
    const claim = await this.ownPending(user, id);
    if (
      claim.method !== VerificationMethod.BUSINESS_EMAIL ||
      !claim.verificationSecretHash
    ) {
      throw new BadRequestException('No code was sent for this claim');
    }
    if (claim.verificationConfirmedAt)
      return { data: this.presentForClaimant(claim) };
    if (
      !claim.verificationExpiresAt ||
      claim.verificationExpiresAt < new Date()
    ) {
      throw new BadRequestException('Code expired. Request a new one.');
    }
    if (claim.verificationAttempts >= MAX_CODE_ATTEMPTS) {
      throw new BadRequestException('Too many wrong codes. Request a new one.');
    }
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
    return { data: this.presentForClaimant(await this.load(id)) };
  }

  /** Look up the TXT record. Only the listed domain is queried, so this cannot be pointed elsewhere. */
  async checkDomain(user: AuthUser, id: string) {
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
      data: {
        verified: true,
        claim: this.presentForClaimant(await this.load(id)),
      },
    };
  }

  async addDocument(user: AuthUser, id: string, dto: AddClaimDocumentDto) {
    const claim = await this.ownPending(user, id);
    if (claim.documents.length >= MAX_DOCUMENTS) {
      throw new BadRequestException(
        `At most ${MAX_DOCUMENTS} documents per claim`,
      );
    }
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

  async cancel(user: AuthUser, id: string) {
    const claim = await this.ownPending(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.businessClaim.update({
        where: { id },
        data: { status: ClaimStatus.CANCELLED, pendingKey: null },
      });
      await this.releasePendingOwnership(claim.businessId, tx);
    });
    return { data: { message: 'Claim cancelled' } };
  }

  async getForClaimant(user: AuthUser, id: string) {
    const claim = await this.load(id);
    if (claim.claimantId !== user.id)
      throw new ForbiddenException('This is not your claim');
    return { data: this.presentForClaimant(claim) };
  }

  async mine(userId: string, page: number, limit: number) {
    const where = { claimantId: userId };
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
      data: rows.map((c) => this.presentForClaimant(c)),
      meta: pageMeta(page, limit, total),
    };
  }

  /** CLAIM_PENDING drops back to UNCLAIMED when the last open claim closes without approval. */
  private async releasePendingOwnership(
    businessId: string,
    tx: Prisma.TransactionClient,
  ) {
    const business = await tx.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    if (business.ownershipStatus !== OwnershipStatus.CLAIM_PENDING) return;
    const open = await tx.businessClaim.count({
      where: { businessId, status: ClaimStatus.PENDING },
    });
    if (!open) {
      await tx.business.update({
        where: { id: businessId },
        data: { ownershipStatus: OwnershipStatus.UNCLAIMED },
      });
    }
  }

  // ──────────────────────────────────────────────────────────────── staff

  async list(status: string | undefined, page: number, limit: number) {
    const where: Prisma.BusinessClaimWhereInput = {
      status: (status?.toUpperCase() as ClaimStatus) ?? ClaimStatus.PENDING,
    };
    const [rows, total] = await Promise.all([
      this.prisma.businessClaim.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...skipTake(page, limit),
        include: {
          business: {
            select: { id: true, slug: true, name: true, ownershipStatus: true },
          },
          claimant: {
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
        verified: !!c.verificationConfirmedAt,
        documentCount: c._count.documents,
        business: {
          ...c.business,
          ownershipStatus: c.business.ownershipStatus.toLowerCase(),
        },
        claimant: c.claimant,
        createdAt: c.createdAt,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  /** Full claim for staff. Documents are only exposed (as 10-minute signed URLs) with CLAIM_DOCUMENTS_VIEW. */
  async detail(actor: AuthUser, id: string) {
    const claim = await this.prisma.businessClaim.findUnique({
      where: { id },
      include: {
        business: { include: { identifiers: true } },
        documents: true,
        claimant: {
          select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            emailVerified: true,
            createdAt: true,
          },
        },
      },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    const canSeeDocs = actor.permissions.includes(
      AdminPermission.CLAIM_DOCUMENTS_VIEW,
    );
    if (canSeeDocs && claim.documents.length) {
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
    const [otherClaims, managers] = await Promise.all([
      this.prisma.businessClaim.findMany({
        where: { businessId: claim.businessId, id: { not: id } },
        select: {
          id: true,
          status: true,
          method: true,
          createdAt: true,
          claimant: { select: { username: true } },
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
        claimant: claim.claimant,
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
          viewUrl: canSeeDocs ? this.uploads.privateViewUrl(d.url) : null,
          restricted: !canSeeDocs,
        })),
        business: {
          id: claim.business.id,
          slug: claim.business.slug,
          name: claim.business.name,
          ownershipStatus: claim.business.ownershipStatus.toLowerCase(),
          identifiers: claim.business.identifiers.map((i) => ({
            type: i.type.toLowerCase(),
            value: i.normalizedValue,
          })),
        },
        currentManagers: managers.map((m) => m.user),
        otherClaims: otherClaims.map((c) => ({
          ...c,
          status: c.status.toLowerCase(),
          method: c.method.toLowerCase(),
        })),
        decisionNote: claim.decisionNote,
        createdAt: claim.createdAt,
      },
    };
  }

  async approve(actor: AuthUser, id: string, dto: ApproveClaimDto) {
    const claim = await this.load(id);
    if (claim.status !== ClaimStatus.PENDING)
      throw new ConflictException('This claim was already decided');
    const automated: VerificationMethod[] = [
      VerificationMethod.BUSINESS_EMAIL,
      VerificationMethod.WEBSITE_DOMAIN,
    ];
    if (
      dto.ownership === 'verified' &&
      automated.includes(claim.method) &&
      !claim.verificationConfirmedAt
    ) {
      throw new BadRequestException(
        'The claimant has not completed email/domain verification. Approve as "claimed" or wait.',
      );
    }
    if (
      dto.ownership === 'verified' &&
      claim.method === VerificationMethod.DOCUMENTS &&
      !claim.documents.length
    ) {
      throw new BadRequestException(
        'No documents were uploaded for this claim',
      );
    }
    const managers = await this.prisma.businessMember.findMany({
      where: {
        businessId: claim.businessId,
        revokedAt: null,
        userId: { not: claim.claimantId },
      },
    });
    if (managers.length && !dto.replaceExistingManagers) {
      throw new ConflictException(
        'Someone else already manages this business. Resend with replaceExistingManagers: true to transfer control.',
      );
    }
    const ownership =
      dto.ownership === 'verified'
        ? OwnershipStatus.VERIFIED
        : OwnershipStatus.CLAIMED;

    await this.prisma.$transaction(async (tx) => {
      await tx.businessClaim.update({
        where: { id },
        data: {
          status: ClaimStatus.APPROVED,
          pendingKey: null,
          decisionNote: dto.note,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      if (managers.length) {
        await tx.businessMember.updateMany({
          where: { id: { in: managers.map((m) => m.id) } },
          data: { revokedAt: new Date() },
        });
      }
      await tx.businessMember.upsert({
        where: {
          businessId_userId: {
            businessId: claim.businessId,
            userId: claim.claimantId,
          },
        },
        create: {
          businessId: claim.businessId,
          userId: claim.claimantId,
          role: MemberRole.OWNER,
          claimId: id,
        },
        update: { revokedAt: null, claimId: id, role: MemberRole.OWNER },
      });
      await tx.business.update({
        where: { id: claim.businessId },
        data: { ownershipStatus: ownership },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'claim.approve',
          targetType: 'claim',
          targetId: id,
          metadata: {
            businessId: claim.businessId,
            claimantId: claim.claimantId,
            ownership,
            revokedManagers: managers.map((m) => m.userId),
            note: dto.note,
          },
        },
        tx,
      );
    });

    await this.notify.toUser(
      claim.claimantId,
      `You now manage ${claim.business.name} on TalkGround`,
      [
        `Your claim for ${claim.business.name} was approved.`,
        'You can now update the profile, respond to reviews and see your dashboard.',
      ],
      { label: 'Open your dashboard', path: `/manage/${claim.businessId}` },
    );
    for (const m of managers) {
      await this.notify.toUser(
        m.userId,
        `Your access to ${claim.business.name} changed`,
        [
          `TalkGround transferred management of ${claim.business.name} to another representative after reviewing an ownership claim.`,
          'If you believe this is a mistake, reply to this email.',
        ],
      );
    }
    return {
      data: {
        claimId: id,
        status: 'approved',
        ownership: ownership.toLowerCase(),
      },
    };
  }

  async reject(actor: AuthUser, id: string, dto: RejectClaimDto) {
    const claim = await this.load(id);
    if (claim.status !== ClaimStatus.PENDING)
      throw new ConflictException('This claim was already decided');
    await this.prisma.$transaction(async (tx) => {
      await tx.businessClaim.update({
        where: { id },
        data: {
          status: ClaimStatus.REJECTED,
          pendingKey: null,
          decisionNote: dto.note,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      await this.releasePendingOwnership(claim.businessId, tx);
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'claim.reject',
          targetType: 'claim',
          targetId: id,
          metadata: { businessId: claim.businessId, note: dto.note },
        },
        tx,
      );
    });
    await this.notify.toUser(
      claim.claimantId,
      `About your claim for ${claim.business.name}`,
      [
        `We could not approve your claim for ${claim.business.name}.`,
        `Reason: ${dto.note}`,
        'You can submit a new claim with more information.',
      ],
    );
    return { data: { claimId: id, status: 'rejected' } };
  }

  /** Staff override of ownership (e.g. revoke access, upgrade to verified). */
  async setOwnership(
    actor: AuthUser,
    businessId: string,
    dto: SetOwnershipDto,
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) throw new NotFoundException('Business not found');
    const managers = await this.prisma.businessMember.count({
      where: { businessId, revokedAt: null },
    });
    if (dto.status !== 'unclaimed' && !managers) {
      throw new BadRequestException(
        'Nobody manages this business. Approve a claim instead.',
      );
    }
    const next =
      dto.status === 'verified'
        ? OwnershipStatus.VERIFIED
        : dto.status === 'claimed'
          ? OwnershipStatus.CLAIMED
          : OwnershipStatus.UNCLAIMED;
    const revoked = await this.prisma.$transaction(async (tx) => {
      let revokedUsers: string[] = [];
      if (next === OwnershipStatus.UNCLAIMED) {
        const active = await tx.businessMember.findMany({
          where: { businessId, revokedAt: null },
        });
        revokedUsers = active.map((m) => m.userId);
        await tx.businessMember.updateMany({
          where: { businessId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.business.update({
        where: { id: businessId },
        data: { ownershipStatus: next },
      });
      await this.audit.record(
        { id: actor.id, role: actor.adminRole ?? undefined },
        {
          action: 'business.ownership_change',
          targetType: 'business',
          targetId: businessId,
          metadata: {
            from: business.ownershipStatus,
            to: next,
            note: dto.note,
            revokedManagers: revokedUsers,
          },
        },
        tx,
      );
      return revokedUsers;
    });
    for (const userId of revoked) {
      await this.notify.toUser(
        userId,
        `Your access to ${business.name} was removed`,
        [
          `TalkGround removed your management access to ${business.name}.`,
          `Reason: ${dto.note}`,
        ],
      );
    }
    return { data: { businessId, ownershipStatus: next.toLowerCase() } };
  }
}
