import { Injectable, NotFoundException } from '@nestjs/common';
import { BusinessStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../common/app-config';
import { ratingMethodology } from '../common/rating-rules';
import type { CategoryOutDto, CityOutDto } from './taxonomy.responses';

const CATEGORY_INCLUDE = {
  parent: { select: { slug: true } },
  dimensions: {
    where: { dimension: { active: true } },
    orderBy: { order: 'asc' },
    include: { dimension: true },
  },
} satisfies Prisma.CategoryInclude;

type CategoryRow = Prisma.CategoryGetPayload<{
  include: typeof CATEGORY_INCLUDE;
}>;

@Injectable()
export class TaxonomyService {
  constructor(
    private prisma: PrismaService,
    private appConfig: AppConfig,
  ) {}

  present(c: CategoryRow, businessCount: number): CategoryOutDto {
    return {
      slug: c.slug,
      name: c.name,
      description: c.description,
      parentSlug: c.parent?.slug ?? null,
      ratingDimensions: c.dimensions.map((d) => ({
        key: d.dimension.key,
        label: d.dimension.label,
        description: d.dimension.description,
        required: d.required,
        order: d.order,
      })),
      businessCount,
      path: `/c/${c.slug}`,
    };
  }

  private async countsByCategory() {
    const counts = await this.prisma.business.groupBy({
      by: ['categoryId'],
      where: { status: BusinessStatus.PUBLISHED },
      _count: { _all: true },
    });
    return new Map(counts.map((c) => [c.categoryId, c._count._all]));
  }

  async categories() {
    const [rows, counts] = await Promise.all([
      this.prisma.category.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: CATEGORY_INCLUDE,
      }),
      this.countsByCategory(),
    ]);
    return { data: rows.map((c) => this.present(c, counts.get(c.id) ?? 0)) };
  }

  async category(slug: string) {
    const c = await this.prisma.category.findUnique({
      where: { slug },
      include: CATEGORY_INCLUDE,
    });
    if (!c || !c.active) throw new NotFoundException('Category not found');
    const counts = await this.countsByCategory();
    return { data: this.present(c, counts.get(c.id) ?? 0) };
  }

  async cities(): Promise<{ data: CityOutDto[] }> {
    const [rows, counts] = await Promise.all([
      this.prisma.city.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.business.groupBy({
        by: ['cityId'],
        where: { status: BusinessStatus.PUBLISHED, cityId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.cityId, c._count._all]));
    return {
      data: rows.map((c) => ({
        slug: c.slug,
        name: c.name,
        state: c.state,
        countryCode: c.countryCode,
        businessCount: countBy.get(c.id) ?? 0,
      })),
    };
  }

  methodology() {
    return { data: ratingMethodology(this.appConfig.minReviewsForRating) };
  }

  publicConfig() {
    return { data: this.appConfig.publicValues() };
  }
}
