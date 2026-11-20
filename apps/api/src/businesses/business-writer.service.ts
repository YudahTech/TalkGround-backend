import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessSource,
  BusinessStatus,
  IdentifierType,
  LocationType,
  OwnershipStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  identifierSearchTerms,
  identifierUniqueKey,
  normalizeDomain,
  normalizeIdentifier,
  normalizeName,
  normalizeNigerianPhone,
} from '../common/identifiers';
import { normalizeState, stateName } from '../common/nigeria';
import { cleanText, slugify } from '../common/utils';
import { RatingsService } from './ratings.service';
import type { IdentifierInputDto, LocationInputDto } from './businesses.dto';

type Db = Prisma.TransactionClient | PrismaService;

export interface PreparedIdentifier {
  type: IdentifierType;
  value: string;
  normalizedValue: string;
  uniqueKey: string | null;
}

export interface DuplicateCandidate {
  id: string;
  slug: string;
  name: string;
  status: string;
  reasons: string[];
}

export interface NewBusinessInput {
  name: string;
  categoryId: string;
  description?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  identifiers?: IdentifierInputDto[];
  locations?: LocationInputDto[];
  status: BusinessStatus;
  source: BusinessSource;
  createdById?: string | null;
}

/**
 * Every write that creates or reshapes a listing goes through here, so identifier
 * normalisation, duplicate detection (PRD §7.2, §7.3) and the search index stay consistent.
 */
@Injectable()
export class BusinessWriterService {
  constructor(
    private prisma: PrismaService,
    private ratings: RatingsService,
  ) {}

  // ─────────────────────────────────────────────────────────────── inputs

  async categoryIdBySlug(slug: string, db: Db = this.prisma): Promise<string> {
    const category = await db.businessCategory.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });
    if (!category || !category.isActive) {
      throw new BadRequestException(`Unknown category: ${slug}`);
    }
    return category.id;
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
        uniqueKey: identifierUniqueKey(item.type, normalizedValue),
      });
    }
    return out;
  }

  prepareLocations(input: LocationInputDto[] = []) {
    return input.map((loc, index) => {
      const nationwide = loc.nationwide ?? false;
      const state = loc.state ? normalizeState(loc.state) : null;
      if (loc.state && !state) {
        throw new BadRequestException(
          `Unknown Nigerian state: ${loc.state} (see GET /locations)`,
        );
      }
      if (!state && !nationwide) {
        throw new BadRequestException(
          'Each location needs a state, or nationwide: true',
        );
      }
      return {
        type: loc.type ?? LocationType.ADDRESS,
        addressLine: loc.addressLine ? cleanText(loc.addressLine) : null,
        area: loc.area ? cleanText(loc.area) : null,
        city: loc.city ? cleanText(loc.city) : null,
        state,
        nationwide,
        isPrimary: loc.isPrimary ?? index === 0,
      };
    });
  }

  /** Website/phone/email fields are also identifiers, so they take part in duplicate checks. */
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
    if (fields.publicEmail) {
      out.push({ type: IdentifierType.EMAIL, value: fields.publicEmail });
    }
    return out;
  }

  // ────────────────────────────────────────────────────── duplicate detection

  /** Identifiers that already belong to another listing. These are hard conflicts. */
  async identifierConflicts(
    identifiers: PreparedIdentifier[],
    excludeBusinessId?: string,
    db: Db = this.prisma,
  ) {
    const keys = identifiers
      .map((i) => i.uniqueKey)
      .filter((k): k is string => !!k);
    if (!keys.length) return [];
    return db.businessIdentifier.findMany({
      where: {
        uniqueKey: { in: keys },
        ...(excludeBusinessId
          ? { businessId: { not: excludeBusinessId } }
          : {}),
      },
      include: {
        business: {
          select: { id: true, slug: true, name: true, status: true },
        },
      },
    });
  }

  /**
   * Listings that may be the same real business: same unique identifier (strong), same or
   * very similar name (trigram similarity), or matching alternative name.
   */
  async findDuplicateCandidates(input: {
    name: string;
    identifiers?: PreparedIdentifier[];
    excludeBusinessId?: string;
  }): Promise<DuplicateCandidate[]> {
    const found = new Map<string, DuplicateCandidate>();
    const add = (
      b: { id: string; slug: string; name: string; status: string },
      reason: string,
    ) => {
      if (b.id === input.excludeBusinessId) return;
      const entry = found.get(b.id) ?? { ...b, reasons: [] };
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
      found.set(b.id, entry);
    };

    for (const c of await this.identifierConflicts(
      input.identifiers ?? [],
      input.excludeBusinessId,
    )) {
      add(c.business, `same ${c.type.toLowerCase()} (${c.normalizedValue})`);
    }

    const normalized = normalizeName(input.name);
    if (normalized) {
      const similar = await this.prisma.$queryRaw<
        {
          id: string;
          slug: string;
          name: string;
          status: string;
          sim: number;
        }[]
      >`
        SELECT id, slug, name, status::text AS status,
               similarity(lower(name), ${normalized}) AS sim
        FROM "Business"
        WHERE status NOT IN ('MERGED', 'ARCHIVED')
          AND similarity(lower(name), ${normalized}) > 0.45
        ORDER BY sim DESC
        LIMIT 10`;
      for (const s of similar)
        add(s, `similar name (${Math.round(s.sim * 100)}%)`);

      const alt = await this.prisma.businessIdentifier.findMany({
        where: {
          type: IdentifierType.ALTERNATIVE_NAME,
          normalizedValue: normalized,
          business: {
            status: { notIn: [BusinessStatus.MERGED, BusinessStatus.ARCHIVED] },
          },
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

  // ───────────────────────────────────────────────────────────────── writes

  async uniqueSlug(name: string, db: Db = this.prisma): Promise<string> {
    const base = slugify(name) || 'business';
    let slug = base;
    for (let i = 2; await db.business.findUnique({ where: { slug } }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  /**
   * Create a listing with its identifiers and locations. Throws 409 when an identifier
   * already belongs to another listing — the right fix is a merge, not a second listing.
   */
  async create(input: NewBusinessInput, db: Db = this.prisma) {
    const identifiers = this.prepareIdentifiers([
      ...(input.identifiers ?? []),
      ...this.profileFieldIdentifiers(input),
    ]);
    const conflicts = await this.identifierConflicts(
      identifiers,
      undefined,
      db,
    );
    if (conflicts.length) {
      throw new ConflictException({
        message: 'An identifier already belongs to another listing',
        conflicts: conflicts.map((c) => ({
          type: c.type,
          value: c.normalizedValue,
          business: c.business,
        })),
      });
    }
    const locations = this.prepareLocations(input.locations);

    const business = await db.business.create({
      data: {
        slug: await this.uniqueSlug(input.name, db),
        name: cleanText(input.name),
        categoryId: input.categoryId,
        description: input.description ? cleanText(input.description) : null,
        logoUrl: input.logoUrl ?? null,
        website: input.website ?? null,
        publicEmail: input.publicEmail?.toLowerCase() ?? null,
        publicPhone: input.publicPhone
          ? normalizeNigerianPhone(input.publicPhone)
          : null,
        status: input.status,
        source: input.source,
        createdById: input.createdById ?? null,
        publishedAt:
          input.status === BusinessStatus.PUBLISHED ? new Date() : null,
        identifiers: { create: identifiers },
        locations: { create: locations },
      },
    });
    await this.rebuildSearchText(business.id, db);
    return business;
  }

  async replaceLocations(
    businessId: string,
    locations: LocationInputDto[],
    db: Db = this.prisma,
  ) {
    const prepared = this.prepareLocations(locations);
    await db.businessLocation.deleteMany({ where: { businessId } });
    if (prepared.length) {
      await db.businessLocation.createMany({
        data: prepared.map((l) => ({ ...l, businessId })),
      });
    }
  }

  /** Keep the profile-field identifiers (website/phone/email) in sync with the profile columns. */
  async syncProfileIdentifiers(
    businessId: string,
    fields: {
      website?: string | null;
      publicPhone?: string | null;
      publicEmail?: string | null;
    },
    db: Db = this.prisma,
  ) {
    const pairs: [IdentifierType, string | null | undefined][] = [
      [IdentifierType.WEBSITE, fields.website],
      [IdentifierType.PHONE, fields.publicPhone],
      [IdentifierType.EMAIL, fields.publicEmail],
    ];
    for (const [type, value] of pairs) {
      if (value === undefined) continue;
      if (!value) continue; // clearing a profile field keeps the identifier (still useful for search)
      const [prepared] = this.prepareIdentifiers([{ type, value }]);
      if (!prepared) continue;
      const conflicts = await this.identifierConflicts(
        [prepared],
        businessId,
        db,
      );
      if (conflicts.length) {
        throw new ConflictException(
          `That ${type.toLowerCase()} already belongs to another listing (${conflicts[0].business.name})`,
        );
      }
      const exists = await db.businessIdentifier.findFirst({
        where: { businessId, type, normalizedValue: prepared.normalizedValue },
      });
      if (!exists) {
        await db.businessIdentifier.create({
          data: { ...prepared, businessId },
        });
      }
    }
  }

  async addIdentifier(
    businessId: string,
    input: IdentifierInputDto,
    db: Db = this.prisma,
  ) {
    const [prepared] = this.prepareIdentifiers([input]);
    const conflicts = await this.identifierConflicts(
      [prepared],
      businessId,
      db,
    );
    if (conflicts.length) {
      throw new ConflictException({
        message: `That ${prepared.type.toLowerCase()} already belongs to another listing`,
        conflicts: conflicts.map((c) => ({ business: c.business })),
      });
    }
    const existing = await db.businessIdentifier.findFirst({
      where: {
        businessId,
        type: prepared.type,
        normalizedValue: prepared.normalizedValue,
      },
    });
    if (existing) return existing;
    const created = await db.businessIdentifier.create({
      data: { ...prepared, businessId },
    });
    await this.rebuildSearchText(businessId, db);
    return created;
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

  /** Regenerate Business.searchText; a DB trigger turns it into the weighted tsvector. */
  async rebuildSearchText(businessId: string, db: Db = this.prisma) {
    const b = await db.business.findUniqueOrThrow({
      where: { id: businessId },
      include: { identifiers: true, locations: true, category: true },
    });
    const parts = [
      b.name,
      normalizeName(b.name),
      b.category.name,
      ...b.identifiers.map((i) =>
        identifierSearchTerms(i.type, i.value, i.normalizedValue),
      ),
      ...b.locations.flatMap((l) => [l.area, l.city, stateName(l.state)]),
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
   * Merge a duplicate listing into the canonical one (PRD §7.4 "merged", §8.5 audit).
   * Moves identifiers, locations, reviews, responses, disputes, claims and managers; the
   * source keeps its row (status MERGED, mergedIntoId) so old links can redirect.
   * A reviewer with a current review on both keeps the newer one current; the older becomes
   * an "earlier experience" so the merged business never double-counts one person.
   */
  async merge(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException('Cannot merge a business into itself');
    }
    return this.prisma.$transaction(
      async (tx) => {
        const [source, target] = await Promise.all([
          tx.business.findUnique({
            where: { id: sourceId },
            include: { identifiers: true, locations: true },
          }),
          tx.business.findUnique({
            where: { id: targetId },
            include: { identifiers: true },
          }),
        ]);
        if (!source || !target)
          throw new NotFoundException('Business not found');
        if (source.status === BusinessStatus.MERGED) {
          throw new ConflictException('Source business was already merged');
        }
        if (
          target.status === BusinessStatus.MERGED ||
          target.status === BusinessStatus.ARCHIVED
        ) {
          throw new BadRequestException('Target must be an active listing');
        }

        // Identifiers: move what the target lacks; drop exact duplicates.
        const targetKeys = new Set(
          target.identifiers.map((i) => `${i.type}:${i.normalizedValue}`),
        );
        for (const ident of source.identifiers) {
          if (targetKeys.has(`${ident.type}:${ident.normalizedValue}`)) {
            await tx.businessIdentifier.delete({ where: { id: ident.id } });
          } else {
            await tx.businessIdentifier.update({
              where: { id: ident.id },
              data: { businessId: targetId },
            });
          }
        }
        // The duplicate's name stays findable as an alternative name of the target.
        const altName = normalizeName(source.name);
        if (
          altName !== normalizeName(target.name) &&
          !targetKeys.has(`ALTERNATIVE_NAME:${altName}`)
        ) {
          await tx.businessIdentifier.create({
            data: {
              businessId: targetId,
              type: IdentifierType.ALTERNATIVE_NAME,
              value: source.name,
              normalizedValue: altName,
            },
          });
        }

        await tx.businessLocation.updateMany({
          where: { businessId: sourceId },
          data: { businessId: targetId, isPrimary: false },
        });

        // Reviews: resolve "two current reviews from one person" before moving.
        const sourceReviews = await tx.review.findMany({
          where: { businessId: sourceId },
          select: { id: true, userId: true, activeKey: true, createdAt: true },
        });
        const targetActive = await tx.review.findMany({
          where: { businessId: targetId, activeKey: { not: null } },
          select: { id: true, userId: true, createdAt: true },
        });
        const targetActiveByUser = new Map(
          targetActive.map((r) => [r.userId, r]),
        );
        await tx.review.updateMany({
          where: { businessId: sourceId },
          data: { activeKey: null },
        });
        for (const r of sourceReviews) {
          if (!r.activeKey) continue;
          const clash = targetActiveByUser.get(r.userId);
          if (!clash) {
            await tx.review.update({
              where: { id: r.id },
              data: { activeKey: `${targetId}:${r.userId}` },
            });
          } else if (r.createdAt > clash.createdAt) {
            await tx.review.update({
              where: { id: clash.id },
              data: { activeKey: null, supersededAt: new Date() },
            });
            await tx.review.update({
              where: { id: r.id },
              data: { activeKey: `${targetId}:${r.userId}` },
            });
          } else {
            await tx.review.update({
              where: { id: r.id },
              data: { supersededAt: new Date() },
            });
          }
        }
        await tx.review.updateMany({
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

        // Claims: open claims follow the business; one open claim per person on the target.
        const openClaims = await tx.businessClaim.findMany({
          where: { businessId: sourceId, pendingKey: { not: null } },
        });
        for (const c of openClaims) {
          const key = `${targetId}:${c.claimantId}`;
          const dup = await tx.businessClaim.findUnique({
            where: { pendingKey: key },
          });
          await tx.businessClaim.update({
            where: { id: c.id },
            data: dup
              ? {
                  status: 'CANCELLED',
                  pendingKey: null,
                  decisionNote:
                    'Merged into another listing with an open claim',
                }
              : { businessId: targetId, pendingKey: key },
          });
        }
        await tx.businessClaim.updateMany({
          where: { businessId: sourceId },
          data: { businessId: targetId },
        });

        // Managers of the duplicate keep access unless they already manage the target.
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
          OwnershipStatus.VERIFIED,
        ];
        const ownership =
          rank.indexOf(source.ownershipStatus) >
          rank.indexOf(target.ownershipStatus)
            ? source.ownershipStatus
            : target.ownershipStatus;

        await tx.business.update({
          where: { id: targetId },
          data: {
            ownershipStatus: ownership,
            underInvestigation:
              target.underInvestigation || source.underInvestigation,
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
          movedReviews: sourceReviews.length,
        };
      },
      { timeout: 30_000 },
    );
  }
}
