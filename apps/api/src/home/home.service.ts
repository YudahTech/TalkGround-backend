import { Injectable } from '@nestjs/common';

import { BrandStatus, ReviewStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { BrandsService } from '../brands/brands.service';

import { HomeQueryDto } from './home.dto';

import {

  categoryLabel,

  formatRelativeDate,

  toApiCategory,

  toApiCity,

} from '../common/utils';



const PUBLIC_REVIEW_STATUSES = [

  ReviewStatus.PUBLISHED,

  ReviewStatus.PENDING_VERIFICATION,

] as const;



@Injectable()

export class HomeService {

  constructor(

    private prisma: PrismaService,

    private brands: BrandsService,

  ) {}



  async getHomeFeed(query: HomeQueryDto) {

    const trustedLimit = query.limit ?? 6;

    const sectorLimit = query.sectorLimit ?? 4;

    const brandFilters = {

      city: query.city,

      category: query.category,

      q: query.q,

    };



    const reviewWhere = {

      status: { in: [...PUBLIC_REVIEW_STATUSES] },

      brand: {

        status: BrandStatus.ACTIVE,

        ...(query.city ? { city: query.city } : {}),

        ...(query.category ? { category: query.category } : {}),

        ...(query.q

          ? {

              OR: [

                { name: { contains: query.q, mode: 'insensitive' as const } },

                { area: { contains: query.q, mode: 'insensitive' as const } },

              ],

            }

          : {}),

      },

    };



    const [

      trustedReviews,

      brandCount,

      sectorBrands,

      topRatedThisWeek,

    ] = await Promise.all([

      this.prisma.review.findMany({

        where: reviewWhere,

        take: trustedLimit,

        orderBy: [

          { helpfulVotes: { _count: 'desc' } },

          { createdAt: 'desc' },

        ],

        include: {

          brand: {

            select: {

              name: true,

              slug: true,

              category: true,

              city: true,

              logoUrl: true,

            },

          },

          user: {

            select: { displayName: true, username: true, avatarUrl: true },

          },

          _count: { select: { helpfulVotes: true } },

        },

      }),

      this.prisma.brand.count({

        where: {

          status: BrandStatus.ACTIVE,

          ...(query.city ? { city: query.city } : {}),

          ...(query.category ? { category: query.category } : {}),

        },

      }),

      this.brands.listForHomeSector(brandFilters, sectorLimit),

      this.brands.getTopRatedThisWeek(brandFilters, 5),

    ]);



    const mapTrustedCard = (review: (typeof trustedReviews)[number]) => ({

      id: review.id,

      rating: review.rating,

      title: review.title,

      excerpt:

        review.body.length > 140

          ? `${review.body.slice(0, 140).trim()}...`

          : review.body,

      helpfulCount: review._count.helpfulVotes,

      createdAt: review.createdAt,

      relativeDate: formatRelativeDate(review.createdAt),

      author: {

        displayName: review.user.displayName,

        username: review.user.username,

        avatarUrl: review.user.avatarUrl,

      },

      brand: {

        name: review.brand.name,

        slug: review.brand.slug,

        logoUrl: review.brand.logoUrl,

        category: toApiCategory(review.brand.category),

        categoryLabel: categoryLabel(review.brand.category),

        city: toApiCity(review.brand.city),

      },

    });



    const trustedBrandCards = trustedReviews.map(mapTrustedCard);



    return {

      data: {

        hero: {

          title: "Know who's actually worth your money.",

          subtitle:

            'Discover and review trusted restaurants and hotels in Lagos & Abuja.',

        },

        categories: [

          { id: 'all', label: 'All', value: null },

          { id: 'restaurants', label: 'Dining', value: 'restaurants' },

          { id: 'hotels', label: 'Hotels & Stay', value: 'hotels' },

        ],

        cities: [

          { id: 'lagos', label: 'Lagos', value: 'lagos' },

          { id: 'abuja', label: 'Abuja', value: 'abuja' },

        ],

        stats: { totalBrands: brandCount },

        trustedBrandCards,

        featuredReviews: trustedBrandCards,

        sectorBrands,

        topRatedThisWeek,

      },

    };

  }

}


