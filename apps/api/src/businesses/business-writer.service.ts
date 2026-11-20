import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessStatus,
  ClaimStatus,
  IdentifierType,
  ListingSource,
  OwnershipStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  identifierSearchTerms,
  normalizeDomain,
  normalizeIdentifier,
  normalizeName,
  normalizeNigerianPhone,
} from '../common/identifiers';
import { cleanText, slugify } from '../common/utils';
import { RatingsService } from './ratings.service';
import { assertTransition } from './lifecycle';
import type { IdentifierInputDto, LocationFieldsDto } from './businesses.dto';
import type { DuplicateCandidateDto } from './businesses.responses';

type Db = Prisma.TransactionClient | PrismaService;

export interface PreparedIdentifier {
  type: IdentifierType;
  value: string;
  normalizedValue: string;
}

export interface NewBusinessInput {
  name: string;
  categoryId: string;
  cityId: string | null;
  area: string | null;
  onlineOnly: boolean;
  description?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  identifiers?: IdentifierInputDto[];
  status: BusinessStatus;
  createdBySource: ListingSource;
  createdById?: string | null;
}

/**
 * Every write that creates or reshapes a listing goes through here, so identifier normalisation,
 * duplicate signals (PRD v2.5 §13), slugs and their history (§7.13) and the search index stay
 * consistent.
 */
@Injectable()
export class BusinessWriterService {
  constructor(
    private prisma: PrismaService,
    private ratings: RatingsService,
  ) {}

  // ─────────────────────────────────────────────────────────────── inputs

  async categoryIdBySlug(
    slug: string,
    db: Db = this.prisma,
    allowInactive = false,
  ): Promise<string> {
    const category = await db.category.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });
    if (!category || (!category.active && !allowInactive)) {
      throw new BadRequestException(`Unknown category: ${slug}`);
    }
    return category.id;
  }

  /** City slug + area, or online only (PRD §7.3). */
  async resolveLocation(
    input: LocationFieldsDto,
    db: Db = this.prisma,
    current?: {
      cityId: string | null;
      area: string | null;
      onlineOnly: boolean;
    },
  ): Promise<{
    cityId: string | null;
    area: string | null;
    onlineOnly: boolean;
  }> {
    const onlineOnly = input.onlineOnly ?? current?.onlineOnly ?? false;
    // An update that does not mention the city keeps the current one.
    let cityId: string | null =
      input.city === undefined ? (current?.cityId ?? null) : null;
    if (input.city) {
      const city = await db.city.findUnique({ where: { slug: input.city } });
      if (!city || !city.active) {
        throw new BadRequestException(
          `Unknown city: ${input.city} (see GET /cities)`,
        );
      }
      cityId = city.id;
    }
    if (!cityId && !onlineOnly) {
      throw new BadRequestException('Choose a city, or set onlineOnly: true');
    }
    const area =
      input.area !== undefined
        ? input.area
          ? cleanText(input.area)
          : null
        : (current?.area ?? null);
    return { cityId, area, onlineOnly };
  }

  prepareIdentifiers(input: IdentifierInputDto[] = []): PreparedIdentifier[] {
    const seen = new Set<string>();
    const out: PreparedIdentifier[] = [];
    for (const item of input) {
      const normalizedValue = normalizeIdentifier(item.type, item.value);
      const key = `${item.type}:${normalizedValue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        type: item.type,
        value: cleanText(item.value).slice(0, 200),
        normalizedValue,
      });
    }
    return out;
  }

  /** Website/phone/email profile fields are also identifiers, so they feed search and duplicate checks. */
  profileFieldIdentifiers(fields: {
    website?: string | null;
    publicPhone?: string | null;
    publicEmail?: string | null;
  }): IdentifierInputDto[] {
    const out: IdentifierInputDto[] = [];
    if (fields.website && normalizeDomain(fields.website)) {
      out.push({ type: IdentifierType.WEBSITE, value: fields.website });
    }
    if (fields.publicPhone) {
      if (!normalizeNigerianPhone(fields.publicPhone)) {
        throw new BadRequestException(
          'publicPhone must be a Nigerian phone number',
        );
      }
      out.push({ type: IdentifierType.PHONE, value: fields.publicPhone });
    }
    if (fields.publicEmail)
      out.push({ type: IdentifierType.EMAIL, value: fields.publicEmail });
    return out;
  }

  // ─────────────────────────────────────────────── duplicate signals (never rejections)

  /**
   * Listings that may be the same real business: a matching identifier (social handles are the
   * strongest signal), or a very similar name. Staff decide; nothing is rejected or merged here.
   */
  async findDuplicateCandidates(input: {
    name: string;
    identifiers?: PreparedIdentifier[];
    excludeBusinessId?: string;
    db?: Db;
  }): Promise<DuplicateCandidateDto[]> {
    const db = input.db ?? this.prisma;
    const found = new Map<string, DuplicateCandidateDto>();
    const add = (
      b: { id: string; slug: string; name: string; status: string },
      reason: string,
    ) => {
      if (b.id === input.excludeBusinessId) return;
      const entry = found.get(b.id) ?? {
        id: b.id,
        slug: b.slug,
        name: b.name,
        status: b.status.toLowerCase(),
        reasons: [],
      };
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
      found.set(b.id, entry);
    };
    const live = {
      notIn: [
        BusinessStatus.MERGED,
        BusinessStatus.ARCHIVED,
        BusinessStatus.REJECTED,
      ],
    };

    const ids = input.identifiers ?? [];
    if (ids.length) {
      const matches = await db.businessIdentifier.findMany({
        where: {
          OR: ids.map((i) => ({
            type: i.type,
            normalizedValue: i.normalizedValue,
          })),
          business: { status: live },
        },
        include: {
          business: {
            select: { id: true, slug: true, name: true, status: true },
          },
        },
        take: 50,
      });
      for (const m of matches)
        add(m.business, `same ${m.type.toLowerCase()} (${m.normalizedValue})`);
    }

    const normalized = normalizeName(input.name);
    if (normalized) {
      const similar = await db.$queryRaw<
        {
          id: string;
          slug: string;
          name: string;
          status: string;
          sim: number;
        }[]
      >`
        SELECT id, slug, name, status::text AS status, similarity(lower(name), ${normalized}) AS sim
        FROM "Business"
        WHERE status NOT IN ('MERGED', 'ARCHIVED', 'REJECTED')
          AND similarity(lower(name), ${normalized}) > 0.45
        ORDER BY sim DESC
        LIMIT 10`;
      for (const s of similar)
        add(s, `similar name (${Math.round(s.sim * 100)}%)`);
      const alt = await db.businessIdentifier.findMany({
        where: {
          type: IdentifierType.ALT_NAME,
          normalizedValue: normalized,
          business: { status: live },
        },
        include: {
          business: {
            select: { id: true, slug: true, name: true, status: true },
          },
        },
        take: 10,
      });
      for (const a of alt) add(a.business, 'matches an alternative name');
    }
    return [...found.values()];
  }

  // ─────────────────────────────────────────────────────────────── slugs

  private async slugTaken(slug: string, db: Db) {
    const [b, h] = await Promise.all([
      db.business.findUnique({ where: { slug }, select: { id: true } }),
      db.businessSlugHistory.findUnique({
        where: { oldSlug: slug },
        select: { id: true },
      }),
    ]);
    return !!b || !!h;
  }

  /**
   * Lowercase, URL-safe, unique across current AND historical slugs (never reused). On conflict the
   * area (or city) is added, then a number (PRD §7.13). Admins never type slugs.
   */
  async uniqueSlug(
    name: string,
    hint: string | null,
    db: Db = this.prisma,
  ): Promise<string> {
    const base = slugify(name) || 'business';
    if (!(await this.slugTaken(base, db))) return base;
    const withHint = hint ? `${base}-${slugify(hint)}` : base;
    if (hint && !(await this.slugTaken(withHint, db))) return withHint;
    for (let i = 2; ; i++) {
      const candidate = `${withHint}-${i}`;
      if (!(await this.slugTaken(candidate, db))) return candidate;
    }
  }

  private async locationHint(
    cityId: string | null,
    area: string | null,
    db: Db,
  ) {
    if (area) return area;
    if (!cityId) return null;
    return (
      (
        await db.city.findUnique({
          where: { id: cityId },
          select: { name: true },
        })
      )?.name ?? null
    );
  }

  /** Rename: new slug, old slug kept in history so it 301s forever. */
  async rename(businessId: string, name: string, db: Db = this.prisma) {
    const b = await db.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const clean = cleanText(name);
    if (clean === b.name) return b.slug;
    const slug = await this.uniqueSlug(
      clean,
      await this.locationHint(b.cityId, b.area, db),
      db,
    );
    await db.businessSlugHistory.create({
      data: { businessId, oldSlug: b.slug },
    });
    await db.business.update({
      where: { id: businessId },
      data: { name: clean, slug },
    });
    return slug;
  }

  // ─────────────────────────────────────────────────────────────── writes

  async create(input: NewBusinessInput, db: Db = this.prisma) {
    const identifiers = this.prepareIdentifiers([
      ...(input.identifiers ?? []),
      ...this.profileFieldIdentifiers(input),
    ]);
    const name = cleanText(input.name);
    const business = await db.business.create({
      data: {
        slug: await this.uniqueSlug(
          name,
          await this.locationHint(input.cityId, input.area, db),
          db,
        ),
        name,
        categoryId: input.categoryId,
        cityId: input.cityId,
        area: input.area,
        onlineOnly: input.onlineOnly,
        description: input.description ? cleanText(input.description) : null,
        logoUrl: input.logoUrl ?? null,
        website: input.website ?? null,
        publicEmail: input.publicEmail?.toLowerCase() ?? null,
        publicPhone: input.publicPhone
          ? normalizeNigerianPhone(input.publicPhone)
          : null,
        status: input.status,
        createdBySource: input.createdBySource,
        createdById: input.createdById ?? null,
        publishedAt:
          input.status === BusinessStatus.PUBLISHED ? new Date() : null,
        identifiers: { create: identifiers },
      },
    });
    await this.rebuildSearchText(business.id, db);
    return business;
  }

  /** Keep website/phone/email identifiers in sync with the profile columns. */
  async syncProfileIdentifiers(
    businessId: string,
    fields: {
      website?: string | null;
      publicPhone?: string | null;
      publicEmail?: string | null;
    },
    db: Db = this.prisma,
  ) {
    for (const ident of this.prepareIdentifiers(
      this.profileFieldIdentifiers(fields),
    )) {
      await db.businessIdentifier.upsert({
        where: {
          businessId_type_normalizedValue: {
            businessId,
            type: ident.type,
            normalizedValue: ident.normalizedValue,
          },
        },
        create: { ...ident, businessId },
        update: {},
      });
    }
  }

  async addIdentifier(
    businessId: string,
    input: IdentifierInputDto,
    db: Db = this.prisma,
  ) {
    const [prepared] = this.prepareIdentifiers([input]);
    const row = await db.businessIdentifier.upsert({
      where: {
        businessId_type_normalizedValue: {
          businessId,
          type: prepared.type,
          normalizedValue: prepared.normalizedValue,
        },
      },
      create: { ...prepared, businessId },
      update: {},
    });
    await this.rebuildSearchText(businessId, db);
    const others = await db.businessIdentifier.findMany({
      where: {
        type: prepared.type,
        normalizedValue: prepared.normalizedValue,
        businessId: { not: businessId },
        business: {
          status: {
            notIn: [
              BusinessStatus.MERGED,
              BusinessStatus.ARCHIVED,
              BusinessStatus.REJECTED,
            ],
          },
        },
      },
      include: { business: { select: { id: true, slug: true, name: true } } },
    });
    // A shared identifier is allowed; it is returned as a duplicate signal for staff (§13).
    return { identifier: row, alsoUsedBy: others.map((o) => o.business) };
  }

  async removeIdentifier(
    businessId: string,
    identifierId: string,
    db: Db = this.prisma,
  ) {
    const removed = await db.businessIdentifier.deleteMany({
      where: { id: identifierId, businessId },
    });
    if (!removed.count) throw new NotFoundException('Identifier not found');
    await this.rebuildSearchText(businessId, db);
  }

  /** Regenerate Business.searchText (a DB trigger turns it into the weighted tsvector). */
  async rebuildSearchText(businessId: string, db: Db = this.prisma) {
    const b = await db.business.findUniqueOrThrow({
      where: { id: businessId },
      include: { identifiers: true, category: true, city: true },
    });
    const parts = [
      b.name,
      normalizeName(b.name),
      b.category.name,
      b.city?.name,
      b.city?.state,
      b.area,
      b.onlineOnly ? 'online' : null,
      ...b.identifiers.map((i) =>
        identifierSearchTerms(i.type, i.value, i.normalizedValue),
      ),
    ].filter((p): p is string => !!p);
    const searchText = [...new Set(parts.map((p) => p.toLowerCase()))].join(
      ' ',
    );
    await db.business.update({
      where: { id: businessId },
      data: { searchText },
    });
  }

  // ─────────────────────────────────────────────────────────────────── merge

  /**
   * Merge a duplicate into the listing to keep (PRD §7.4). Reviews, identifiers, responses,
   * disputes, claims and members move to the target; the source becomes MERGED and its URL
   * 301s to the target. If one person has an active review on both, the newer stays active and
   * the older is soft-deleted (kept for moderation), preserving "one active review per business".
   */
  async merge(sourceId: string, targetId: string) {
    if (sourceId === targetId)
      throw new BadRequestException('Cannot merge a business into itself');
    return this.prisma.$transaction(
      async (tx) => {
        const [source, target] = await Promise.all([
          tx.business.findUnique({
            where: { id: sourceId },
            include: { identifiers: true },
          }),
          tx.business.findUnique({ where: { id: targetId } }),
        ]);
        if (!source || !target)
          throw new NotFoundException('Business not found');
        assertTransition(source.status, BusinessStatus.MERGED);
        if (
          target.status !== BusinessStatus.PUBLISHED &&
          target.status !== BusinessStatus.SUSPENDED
        ) {
          throw new BadRequestException(
            'The business to keep must be published or suspended',
          );
        }

        for (const ident of source.identifiers) {
          await tx.businessIdentifier.upsert({
            where: {
              businessId_type_normalizedValue: {
                businessId: targetId,
                type: ident.type,
                normalizedValue: ident.normalizedValue,
              },
            },
            create: {
              businessId: targetId,
              type: ident.type,
              value: ident.value,
              normalizedValue: ident.normalizedValue,
              verified: ident.verified,
            },
            update: {},
          });
        }
        await tx.businessIdentifier.deleteMany({
          where: { businessId: sourceId },
        });
        const alt = normalizeName(source.name);
        if (alt && alt !== normalizeName(target.name)) {
          await tx.businessIdentifier.upsert({
            where: {
              businessId_type_normalizedValue: {
                businessId: targetId,
                type: IdentifierType.ALT_NAME,
                normalizedValue: alt,
              },
            },
            create: {
              businessId: targetId,
              type: IdentifierType.ALT_NAME,
              value: source.name,
              normalizedValue: alt,
            },
            update: {},
          });
        }

        const sourceActive = await tx.review.findMany({
          where: { businessId: sourceId, activeKey: { not: null } },
          select: { id: true, userId: true, createdAt: true },
        });
        const targetActive = await tx.review.findMany({
          where: { businessId: targetId, activeKey: { not: null } },
          select: { id: true, userId: true, createdAt: true },
        });
        const targetByUser = new Map(targetActive.map((r) => [r.userId, r]));
        await tx.review.updateMany({
          where: { businessId: sourceId },
          data: { activeKey: null },
        });
        for (const r of sourceActive) {
          const clash = targetByUser.get(r.userId);
          if (!clash) {
            await tx.review.update({
              where: { id: r.id },
              data: { activeKey: `${targetId}:${r.userId}` },
            });
          } else if (r.createdAt > clash.createdAt) {
            await tx.review.update({
              where: { id: clash.id },
              data: { activeKey: null, deletedAt: new Date() },
            });
            await tx.review.update({
              where: { id: r.id },
              data: { activeKey: `${targetId}:${r.userId}` },
            });
          } else {
            await tx.review.update({
              where: { id: r.id },
              data: { deletedAt: new Date() },
            });
          }
        }
        const moved = await tx.review.updateMany({
          where: { businessId: sourceId },
          data: { businessId: targetId },
        });
        await tx.businessResponse.updateMany({
          where: { businessId: sourceId },
          data: { businessId: targetId },
        });
        await tx.businessDispute.updateMany({
          where: { businessId: sourceId },
          data: { businessId: targetId },
        });
        await tx.businessSubmission.updateMany({
          where: { businessId: sourceId },
          data: { businessId: targetId },
        });

        const pending = await tx.businessClaim.findMany({
          where: { businessId: sourceId, status: ClaimStatus.PENDING },
        });
        for (const c of pending) {
          const key = `${targetId}:${c.userId}`;
          const dup = await tx.businessClaim.findUnique({
            where: { pendingKey: key },
          });
          await tx.businessClaim.update({
            where: { id: c.id },
            data: dup
              ? {
                  status: ClaimStatus.REJECTED,
                  pendingKey: null,
                  decisionReason:
                    'This listing was merged into another listing where you already have a pending claim.',
                  decidedAt: new Date(),
                }
              : { businessId: targetId, pendingKey: key },
          });
        }
        await tx.businessClaim.updateMany({
          where: { businessId: sourceId },
          data: { businessId: targetId },
        });

        const members = await tx.businessMember.findMany({
          where: { businessId: sourceId },
        });
        for (const m of members) {
          const exists = await tx.businessMember.findUnique({
            where: {
              businessId_userId: { businessId: targetId, userId: m.userId },
            },
          });
          if (exists) await tx.businessMember.delete({ where: { id: m.id } });
          else
            await tx.businessMember.update({
              where: { id: m.id },
              data: { businessId: targetId },
            });
        }

        const rank: OwnershipStatus[] = [
          OwnershipStatus.UNCLAIMED,
          OwnershipStatus.CLAIM_PENDING,
          OwnershipStatus.CLAIMED,
        ];
        const ownershipStatus =
          rank.indexOf(source.ownershipStatus) >
          rank.indexOf(target.ownershipStatus)
            ? source.ownershipStatus
            : target.ownershipStatus;
        await tx.business.update({
          where: { id: targetId },
          data: {
            ownershipStatus,
            ownershipVerified:
              target.ownershipVerified || source.ownershipVerified,
          },
        });
        await tx.business.update({
          where: { id: sourceId },
          data: {
            status: BusinessStatus.MERGED,
            mergedIntoId: targetId,
            reviewCount: 0,
            ratingAverage: null,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            searchText: '',
          },
        });
        await this.ratings.recompute(targetId, tx);
        await this.rebuildSearchText(targetId, tx);
        return {
          source: { id: source.id, slug: source.slug, name: source.name },
          target: { id: target.id, slug: target.slug, name: target.name },
          movedReviews: moved.count,
          before: { status: source.status },
        };
      },
      { timeout: 30_000 },
    );
  }

  /** Sanity check used when admins create listings: duplicates need explicit confirmation. */
  assertNoUnconfirmedDuplicates(
    candidates: DuplicateCandidateDto[],
    confirmed?: boolean,
  ) {
    if (candidates.length && !confirmed) {
      throw new ConflictException({
        message:
          'Possible duplicates found. Merge instead, or resend with confirmNotDuplicate: true.',
        duplicateCandidates: candidates,
      });
    }
  }
}
