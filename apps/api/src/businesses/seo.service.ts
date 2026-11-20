import { Injectable } from '@nestjs/common';
import { BusinessStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../common/app-config';
import type { ReviewDto } from '../reviews/reviews.responses';
import type { RatingSummaryDto, SeoDto } from './businesses.responses';

export interface IndexableInput {
  status: BusinessStatus;
  noindexOverride: boolean;
  description: string | null;
  cityId: string | null;
  onlineOnly: boolean;
  identifierCount: number;
  reviewCount: number;
}

export interface SitemapEntry {
  type: 'business' | 'category' | 'category_city';
  path: string;
  url: string;
  lastModified: Date;
}

/**
 * PRD v2.5 §7.13 search engine visibility. The rule is identical for claimed and unclaimed
 * businesses, and ownership, verification and payment never influence it.
 */
@Injectable()
export class SeoService {
  constructor(
    private prisma: PrismaService,
    private appConfig: AppConfig,
  ) {}

  /** The §7.13 indexable rule. */
  isIndexable(b: IndexableInput): boolean {
    return (
      b.status === BusinessStatus.PUBLISHED &&
      !b.noindexOverride &&
      (b.description?.trim().length ?? 0) >=
        this.appConfig.indexableMinDescriptionChars &&
      (!!b.cityId || b.onlineOnly) &&
      b.identifierCount >= 1 &&
      b.reviewCount >= this.appConfig.indexableMinReviews
    );
  }

  url(path: string) {
    return `${this.appConfig.frontendUrl}${path}`;
  }

  businessSeo(input: {
    business: IndexableInput & {
      name: string;
      slug: string;
      logoUrl: string | null;
    };
    categoryName: string;
    locationLabel: string;
    city: { name: string; state: string } | null;
    area: string | null;
    rating: RatingSummaryDto;
    visibleReviews: ReviewDto[];
  }): SeoDto {
    const { business: b, rating } = input;
    const path = `/b/${b.slug}`;
    const indexable = this.isIndexable(b);
    const title = `${b.name} Reviews | TalkGround`;
    const where = input.locationLabel ? ` in ${input.locationLabel}` : '';
    const description =
      rating.reviewCount === 0
        ? `${b.name} has no reviews yet on TalkGround. ${input.categoryName}${where}.`
        : `Read ${rating.reviewCount} customer review${rating.reviewCount === 1 ? '' : 's'} of ${b.name}, ${input.categoryName.toLowerCase()}${where}.` +
          (rating.average !== null ? ` Rated ${rating.average} out of 5.` : '');

    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': input.city ? 'LocalBusiness' : 'Organization',
      name: b.name,
      url: this.url(path),
      knowsAbout: input.categoryName,
      ...(b.description ? { description: b.description } : {}),
      ...(b.logoUrl ? { logo: b.logoUrl } : {}),
      ...(input.city
        ? {
            address: {
              '@type': 'PostalAddress',
              ...(input.area ? { streetAddress: input.area } : {}),
              addressLocality: input.city.name,
              addressRegion: input.city.state,
              addressCountry: 'NG',
            },
          }
        : { areaServed: { '@type': 'Country', name: 'Nigeria' } }),
    };
    // aggregateRating only when the page displays a rating, with the exact visible numbers.
    if (rating.average !== null) {
      jsonLd.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: rating.average,
        reviewCount: rating.reviewCount,
        bestRating: 5,
        worstRating: 1,
      };
    }
    // Review markup only for PUBLISHED reviews shown on the page.
    const marked = input.visibleReviews.filter((r) => r.status === 'published');
    if (marked.length) {
      jsonLd.review = marked.map((r) => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.reviewer.displayName },
        datePublished: (r.publishedAt ?? r.createdAt)
          .toISOString()
          .slice(0, 10),
        name: r.title,
        reviewBody: r.body,
        reviewRating: {
          '@type': 'Rating',
          ratingValue: r.overallRating,
          bestRating: 5,
          worstRating: 1,
        },
      }));
    }

    return {
      indexable,
      robots: indexable ? 'index,follow' : 'noindex,follow',
      canonicalPath: path,
      canonicalUrl: this.url(path),
      title,
      description,
      openGraph: {
        title:
          rating.average !== null
            ? `${b.name} — ${rating.average}★ from ${rating.reviewCount} reviews`
            : title,
        description,
        url: this.url(path),
        type: 'website',
        image: b.logoUrl,
      },
      jsonLd,
    };
  }

  categoryPageSeo(
    category: { slug: string; name: string },
    city: { slug: string; name: string } | null,
    publishedCount: number,
  ): SeoDto {
    const path = city
      ? `/c/${category.slug}/${city.slug}`
      : `/c/${category.slug}`;
    const indexable = publishedCount >= this.appConfig.indexableMinListings;
    const place = city ? ` in ${city.name}` : ' in Nigeria';
    const title = `${category.name}${place} — Reviews | TalkGround`;
    const description = `Customer reviews of ${publishedCount} ${category.name.toLowerCase()} business${publishedCount === 1 ? '' : 'es'}${place} on TalkGround.`;
    return {
      indexable,
      robots: indexable ? 'index,follow' : 'noindex,follow',
      canonicalPath: path,
      canonicalUrl: this.url(path),
      title,
      description,
      openGraph: {
        title,
        description,
        url: this.url(path),
        type: 'website',
        image: null,
      },
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        url: this.url(path),
      },
    };
  }

  /** Only indexable URLs (§7.13). The frontend serves this as sitemap.xml. */
  async sitemap(): Promise<SitemapEntry[]> {
    const businesses = await this.prisma.business.findMany({
      where: { status: BusinessStatus.PUBLISHED, noindexOverride: false },
      select: {
        slug: true,
        status: true,
        noindexOverride: true,
        description: true,
        cityId: true,
        onlineOnly: true,
        reviewCount: true,
        updatedAt: true,
        _count: { select: { identifiers: true } },
      },
      take: 50_000,
    });
    const entries: SitemapEntry[] = businesses
      .filter((b) =>
        this.isIndexable({ ...b, identifierCount: b._count.identifiers }),
      )
      .map((b) => ({
        type: 'business',
        path: `/b/${b.slug}`,
        url: this.url(`/b/${b.slug}`),
        lastModified: b.updatedAt,
      }));

    const min = this.appConfig.indexableMinListings;
    const [byCategory, byCategoryCity] = await Promise.all([
      this.prisma.business.groupBy({
        by: ['categoryId'],
        where: { status: BusinessStatus.PUBLISHED, category: { active: true } },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.business.groupBy({
        by: ['categoryId', 'cityId'],
        where: {
          status: BusinessStatus.PUBLISHED,
          category: { active: true },
          cityId: { not: null },
          city: { active: true },
        },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
    ]);
    const [categories, cities] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, slug: true } }),
      this.prisma.city.findMany({ select: { id: true, slug: true } }),
    ]);
    const catSlug = new Map(categories.map((c) => [c.id, c.slug]));
    const citySlug = new Map(cities.map((c) => [c.id, c.slug]));
    for (const g of byCategory) {
      if (g._count._all < min) continue;
      const path = `/c/${catSlug.get(g.categoryId)}`;
      entries.push({
        type: 'category',
        path,
        url: this.url(path),
        lastModified: g._max.updatedAt ?? new Date(),
      });
    }
    for (const g of byCategoryCity) {
      if (g._count._all < min || !g.cityId) continue;
      const path = `/c/${catSlug.get(g.categoryId)}/${citySlug.get(g.cityId)}`;
      entries.push({
        type: 'category_city',
        path,
        url: this.url(path),
        lastModified: g._max.updatedAt ?? new Date(),
      });
    }
    return entries;
  }
}
