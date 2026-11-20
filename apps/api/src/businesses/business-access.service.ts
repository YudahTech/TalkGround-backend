import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Authorisation for business representatives (PRD §7.7: unauthorised users cannot respond). */
@Injectable()
export class BusinessAccessService {
  constructor(private prisma: PrismaService) {}

  /** Throws 403 unless the user is an active manager of the business. Returns the business. */
  async assertManager(userId: string, businessId: string) {
    const member = await this.prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      include: { business: true },
    });
    if (!member || member.revokedAt) {
      throw new ForbiddenException('You do not manage this business');
    }
    if (
      member.business.status === BusinessStatus.MERGED ||
      member.business.status === BusinessStatus.ARCHIVED
    ) {
      throw new NotFoundException('Business not found');
    }
    return member.business;
  }

  async isManager(userId: string, businessId: string): Promise<boolean> {
    const member = await this.prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      select: { revokedAt: true },
    });
    return !!member && !member.revokedAt;
  }

  async managedBusinessIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.businessMember.findMany({
      where: { userId, revokedAt: null },
      select: { businessId: true },
    });
    return rows.map((r) => r.businessId);
  }
}
