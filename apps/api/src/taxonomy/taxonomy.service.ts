import { Injectable, NotFoundException } from '@nestjs/common';
import { BusinessStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NIGERIAN_STATES } from '../common/nigeria';
import { RATING_METHODOLOGY } from '../common/rating-rules';

const CATEGORY_INCLUDE = {
  dimensions: {
    where: { dimension: { isActive: true } },
    orderBy: { sortOrder: 'asc' as const },
    include: { dimension: true },
  },
};

@Injectable()
export class TaxonomyService {
  constructor(private prisma: PrismaService) {}

  presentCategory(c: {
    slug: string;
    name: string;
    description: string | null;
    dimensions: {
      isRequired: boolean;
      dimension: { key: string; name: string; description: string | null };
    }[];
  }) {
    return {
      slug: c.slug,
      name: c.name,
      description: c.description,
      ratingDimensions: c.dimensions.map((d) => ({
        key: d.dimension.key,
        name: d.dimension.name,
        description: d.dimension.description,
        required: d.isRequired,
      })),
    };
  }

  async categories() {
    const [rows, counts] = await Promise.all([
      this.prisma.businessCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: CATEGORY_INCLUDE,
      }),
      this.prisma.business.groupBy({
        by: ['categoryId'],
        where: { status: BusinessStatus.PUBLISHED },
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return {
      data: rows.map((c) => ({
        ...this.presentCategory(c),
        businessCount: countBy.get(c.id) ?? 0,
      })),
    };
  }

  async category(slug: string) {
    const c = await this.prisma.businessCategory.findUnique({
      where: { slug },
      include: CATEGORY_INCLUDE,
    });
    if (!c || !c.isActive) throw new NotFoundException('Category not found');
    return { data: this.presentCategory(c) };
  }

  async locations() {
    const counts = await this.prisma.$queryRaw<
      { state: string; count: bigint }[]
    >`
      SELECT l.state, count(DISTINCT l."businessId")::bigint AS count
      FROM "BusinessLocation" l JOIN "Business" b ON b.id = l."businessId"
      WHERE b.status = 'PUBLISHED' AND l.state IS NOT NULL
      GROUP BY l.state`;
    const countBy = new Map(counts.map((c) => [c.state, Number(c.count)]));
    return {
      data: {
        country: { code: 'NG', name: 'Nigeria' },
        states: NIGERIAN_STATES.map(([slug, name]) => ({
          slug,
          name,
          businessCount: countBy.get(slug) ?? 0,
        })),
      },
    };
  }

  methodology() {
    return { data: RATING_METHODOLOGY };
  }
}
