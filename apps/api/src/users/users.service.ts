import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ClaimStatus, ReviewStatus, VoteValue } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { RatingsService } from '../businesses/ratings.service';
import { PUBLIC_REVIEW_STATUSES } from '../common/rating-rules';
import { randomToken } from '../common/security';
import { cleanText, excerpt } from '../common/utils';
import type { UpdateProfileDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private audit: AuditService,
    private ratings: RatingsService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    return { data: await this.auth.sanitizeUser(user) };
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    if (
      dto.avatarUrl &&
      !/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/.*talkground\/avatars\//.test(
        dto.avatarUrl,
      )
    ) {
      throw new BadRequestException(
        'Upload the avatar with POST /uploads/signature (folder "avatars") first',
      );
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined
          ? { displayName: cleanText(dto.displayName) }
          : {}),
        ...(dto.bio !== undefined
          ? { bio: dto.bio ? cleanText(dto.bio) : null }
          : {}),
        ...(dto.avatarUrl !== undefined
          ? { avatarUrl: dto.avatarUrl || null }
          : {}),
        ...(dto.location !== undefined
          ? { location: dto.location ? cleanText(dto.location) : null }
          : {}),
      },
    });
    return { data: await this.auth.sanitizeUser(user) };
  }

  /**
   * NDPA right to erasure. Personal data is wiped and the account can never log in again.
   * Reviews are withdrawn from public view (ratings recomputed); business access is revoked;
   * the row stays, anonymised, so moderation and audit records keep their references.
   */
  async deleteMe(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Password is incorrect');
    }
    const affected = await this.prisma.review.findMany({
      where: {
        userId,
        status: {
          in: [...PUBLIC_REVIEW_STATUSES, ReviewStatus.PENDING_MODERATION],
        },
      },
      select: { businessId: true },
      distinct: ['businessId'],
    });
    const tag = user.id.replace(/-/g, '').slice(0, 12);
    const passwordHash = await bcrypt.hash(randomToken(), 4);
    await this.prisma.$transaction(async (tx) => {
      await tx.review.updateMany({
        where: {
          userId,
          status: { notIn: [ReviewStatus.REMOVED, ReviewStatus.WITHDRAWN] },
        },
        data: { status: ReviewStatus.WITHDRAWN, activeKey: null },
      });
      await tx.helpfulVote.deleteMany({ where: { userId } });
      await tx.otpCode.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.businessMember.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.businessClaim.updateMany({
        where: { claimantId: userId, status: ClaimStatus.PENDING },
        data: { status: ClaimStatus.CANCELLED, pendingKey: null },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${tag}@deleted.talkground.invalid`,
          username: `deleted_${tag}`,
          displayName: 'Deleted user',
          passwordHash,
          phone: null,
          bio: null,
          avatarUrl: null,
          location: null,
          emailVerified: false,
          phoneVerified: false,
          adminRoleId: null,
          deletedAt: new Date(),
        },
      });
      for (const { businessId } of affected)
        await this.ratings.recompute(businessId, tx);
    });
    await this.auth.revokeAllSessions(userId);
    await this.audit.record(
      { id: userId },
      { action: 'user.self_delete', targetType: 'user', targetId: userId },
    );
    return {
      data: { message: 'Your account and personal data have been deleted.' },
    };
  }

  /** NDPA right of access / portability: everything TalkGround stores about the user, as JSON. */
  async exportMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        phone: true,
        bio: true,
        avatarUrl: true,
        location: true,
        emailVerified: true,
        phoneVerified: true,
        createdAt: true,
        reviews: {
          select: {
            id: true,
            overallRating: true,
            title: true,
            body: true,
            experienceDate: true,
            status: true,
            resolutionStatus: true,
            createdAt: true,
            editedAt: true,
            business: { select: { name: true, slug: true } },
            dimensions: {
              select: { score: true, dimension: { select: { key: true } } },
            },
            evidence: { select: { kind: true, status: true, createdAt: true } },
            revisions: {
              select: {
                overallRating: true,
                title: true,
                body: true,
                createdAt: true,
              },
            },
          },
        },
        helpfulVotes: {
          select: { reviewId: true, value: true, createdAt: true },
        },
        reports: {
          select: {
            reviewId: true,
            reason: true,
            details: true,
            status: true,
            createdAt: true,
          },
        },
        submissions: { select: { name: true, status: true, createdAt: true } },
        claims: {
          select: {
            business: { select: { name: true } },
            status: true,
            method: true,
            createdAt: true,
          },
        },
        memberships: {
          select: {
            business: { select: { name: true } },
            role: true,
            createdAt: true,
            revokedAt: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return { data: { exportedAt: new Date(), ...user } };
  }

  /** PRD §7.1: only what the user chose to display. Never email, phone or verification details. */
  async getPublicProfile(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        displayName: true,
        username: true,
        avatarUrl: true,
        bio: true,
        location: true,
        createdAt: true,
        deletedAt: true,
        suspended: true,
        reviews: {
          where: { status: { in: PUBLIC_REVIEW_STATUSES } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            business: { select: { name: true, slug: true } },
            _count: {
              select: { helpfulVotes: { where: { value: VoteValue.HELPFUL } } },
            },
          },
        },
      },
    });
    if (!user || user.deletedAt || user.suspended)
      throw new NotFoundException('User not found');
    return {
      data: {
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        location: user.location,
        memberSince: user.createdAt,
        reviewCount: user.reviews.length,
        reviews: user.reviews.map((r) => ({
          id: r.id,
          overallRating: r.overallRating,
          title: r.title,
          excerpt: excerpt(r.body, 240),
          helpfulCount: r._count.helpfulVotes,
          earlierExperience: !!r.supersededAt,
          createdAt: r.createdAt,
          business: r.business,
        })),
      },
    };
  }
}
