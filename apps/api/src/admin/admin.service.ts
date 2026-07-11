import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BrandStatus,
  ReportStatus,
  ReviewStatus,
  SuggestionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBrandDto, UpdateBrandDto } from '../brands/brands.dto';
import { slugify } from '../common/utils';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

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
      this.prisma.user.count(),
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

  async listBrands() {
    const brands = await this.prisma.brand.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { data: brands };
  }

  async createBrand(dto: CreateBrandDto) {
    const brand = await this.prisma.brand.create({ data: dto });
    return { data: brand };
  }

  async updateBrand(id: string, dto: UpdateBrandDto) {
    const existing = await this.prisma.brand.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Brand not found');
    const brand = await this.prisma.brand.update({ where: { id }, data: dto });
    return { data: brand };
  }

  async deactivateBrand(id: string) {
    const brand = await this.prisma.brand.update({
      where: { id },
      data: { status: BrandStatus.INACTIVE },
    });
    return { data: brand };
  }

  async reviewQueue(queue: string) {
    let where = {};
    if (queue === 'reported') {
      const reportedIds = await this.prisma.reviewReport.findMany({
        where: { status: ReportStatus.OPEN },
        select: { reviewId: true },
      });
      where = { id: { in: reportedIds.map((r) => r.reviewId) } };
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
        user: { select: { displayName: true, username: true, email: true } },
        brand: { select: { name: true, slug: true } },
        flags: true,
        reports: { where: { status: ReportStatus.OPEN } },
        media: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: reviews };
  }

  async moderateReview(
    id: string,
    action: string,
    note?: string,
    approved?: boolean,
  ) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');

    if (action === 'approve') {
      await this.prisma.review.update({
        where: { id },
        data: { status: ReviewStatus.PUBLISHED },
      });
    } else if (action === 'suspend') {
      await this.prisma.review.update({
        where: { id },
        data: { status: ReviewStatus.SUSPENDED },
      });
    } else if (action === 'remove') {
      await this.prisma.review.update({
        where: { id },
        data: { status: ReviewStatus.REMOVED },
      });
    } else if (action === 'dismiss_report') {
      await this.prisma.reviewReport.updateMany({
        where: { reviewId: id, status: ReportStatus.OPEN },
        data: { status: ReportStatus.DISMISSED },
      });
    } else if (action === 'verify_receipt') {
      if (approved === undefined) {
        throw new BadRequestException('approved field required');
      }
      await this.prisma.review.update({
        where: { id },
        data: {
          verifiedVisit: approved,
          status: ReviewStatus.PUBLISHED,
        },
      });
    } else {
      throw new BadRequestException('Unknown action');
    }

    if (note) {
      console.log(`[MODERATION] review=${id} action=${action} note=${note}`);
    }

    return { data: { message: `Action ${action} applied` } };
  }

  async listSuggestions() {
    const suggestions = await this.prisma.brandSuggestion.findMany({
      where: { status: SuggestionStatus.PENDING },
      include: {
        user: { select: { displayName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: suggestions };
  }

  async resolveSuggestion(
    id: string,
    status: 'approved' | 'rejected',
    adminNote?: string,
  ) {
    const suggestion = await this.prisma.brandSuggestion.findUnique({
      where: { id },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');

    if (status === 'approved') {
      const slug = slugify(suggestion.name);
      await this.prisma.brand.create({
        data: {
          name: suggestion.name,
          slug,
          category: suggestion.category,
          subType: suggestion.subType,
          city: suggestion.city,
          area: suggestion.area,
          website: suggestion.website,
        },
      });
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

    return { data: updated };
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
    return { data: suggestion };
  }

  async suspendUser(id: string, suspended: boolean, reason: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { suspended, suspendedReason: reason },
    });
    return { data: user };
  }
}
