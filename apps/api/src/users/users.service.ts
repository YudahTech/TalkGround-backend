import { Injectable, NotFoundException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './users.dto';
import { categoryLabel, formatRelativeDate, toApiCity } from '../common/utils';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private mapProfile(user: {
    id: string;
    email: string;
    displayName: string;
    username: string;
    bio: string | null;
    avatarUrl: string | null;
    city: string | null;
    interests: string[];
    emailVerified: boolean;
    phoneVerified: boolean;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      username: user.username,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      city: user.city ? toApiCity(user.city) : null,
      location: user.city
        ? `${toApiCity(user.city) === 'lagos' ? 'Lagos' : 'Abuja'}, Nigeria`
        : null,
      interests: user.interests.map((interest) => ({
        value: interest.toLowerCase(),
        label: categoryLabel(interest),
      })),
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      memberSince: user.createdAt,
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { data: this.mapProfile(user) };
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    return { data: this.mapProfile(user) };
  }

  async getDashboard(userId: string) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const reviews = await this.prisma.review.findMany({
      where: { userId, status: { not: ReviewStatus.REMOVED } },
      include: {
        brand: { select: { name: true, slug: true, category: true, area: true } },
        _count: { select: { helpfulVotes: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    const [
      totalReviews,
      reviewsThisWeek,
      reviewsLastWeek,
      helpfulVotes,
      helpfulVotesThisWeek,
      totalViews,
    ] = await Promise.all([
      this.prisma.review.count({
        where: { userId, status: { not: ReviewStatus.REMOVED } },
      }),
      this.prisma.review.count({
        where: {
          userId,
          createdAt: { gte: weekAgo },
          status: { not: ReviewStatus.REMOVED },
        },
      }),
      this.prisma.review.count({
        where: {
          userId,
          createdAt: { gte: twoWeeksAgo, lt: weekAgo },
          status: { not: ReviewStatus.REMOVED },
        },
      }),
      this.prisma.reviewHelpfulVote.count({
        where: { review: { userId } },
      }),
      this.prisma.reviewHelpfulVote.count({
        where: {
          review: { userId },
          createdAt: { gte: weekAgo },
        },
      }),
      this.prisma.review.aggregate({
        where: { userId, status: { not: ReviewStatus.REMOVED } },
        _sum: { viewCount: true },
      }),
    ]);

    const reviewTrend =
      reviewsLastWeek === 0
        ? reviewsThisWeek > 0
          ? 100
          : 0
        : Math.round(((reviewsThisWeek - reviewsLastWeek) / reviewsLastWeek) * 100);

    return {
      data: {
        stats: {
          totalReviews,
          reviewsThisWeek,
          reviewTrendPercent: reviewTrend,
          helpfulVotes,
          helpfulVotesThisWeek,
          totalViews: totalViews._sum.viewCount ?? 0,
        },
        recentReviews: reviews.map((review) => ({
          id: review.id,
          rating: review.rating,
          title: review.title,
          excerpt:
            review.body.length > 120
              ? `${review.body.slice(0, 120).trim()}...`
              : review.body,
          status: review.status.toLowerCase(),
          helpfulCount: review._count.helpfulVotes,
          viewCount: review.viewCount,
          relativeDate: formatRelativeDate(review.createdAt),
          createdAt: review.createdAt,
          brand: {
            name: review.brand.name,
            slug: review.brand.slug,
            categoryLabel: categoryLabel(review.brand.category),
            area: review.brand.area,
          },
        })),
      },
    };
  }

  async getPublicProfile(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        displayName: true,
        username: true,
        avatarUrl: true,
        bio: true,
        city: true,
        createdAt: true,
        reviews: {
          where: {
            status: {
              in: [ReviewStatus.PUBLISHED, ReviewStatus.PENDING_VERIFICATION],
            },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            brand: { select: { name: true, slug: true } },
            _count: { select: { helpfulVotes: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      data: {
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        city: user.city ? toApiCity(user.city) : null,
        memberSince: user.createdAt,
        reviewCount: user.reviews.length,
        reviews: user.reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          body: r.body,
          helpfulCount: r._count.helpfulVotes,
          verifiedVisit: r.verifiedVisit,
          relativeDate: formatRelativeDate(r.createdAt),
          createdAt: r.createdAt,
          brand: r.brand,
        })),
      },
    };
  }

  async getMyReviews(userId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { userId, status: { not: ReviewStatus.REMOVED } },
      orderBy: { updatedAt: 'desc' },
      include: {
        brand: { select: { name: true, slug: true } },
        _count: { select: { helpfulVotes: true } },
      },
    });

    return {
      data: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        status: r.status.toLowerCase(),
        helpfulCount: r._count.helpfulVotes,
        viewCount: r.viewCount,
        verifiedVisit: r.verifiedVisit,
        relativeDate: formatRelativeDate(r.createdAt),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        brand: r.brand,
      })),
    };
  }
}
