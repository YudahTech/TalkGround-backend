import {
  EvidenceStatus,
  EvidenceType,
  Prisma,
  ResolutionStatus,
  ResponseStatus,
  ReviewStatus,
} from '@prisma/client';
import type {
  BusinessResponseDto,
  ReviewDto,
  ReviewLabelDto,
} from './reviews.responses';

/** Prisma include used for every public review read. */
export const PUBLIC_REVIEW_INCLUDE = {
  user: {
    select: {
      displayName: true,
      username: true,
      avatarUrl: true,
      emailVerified: true,
      deletedAt: true,
    },
  },
  dimensionRatings: {
    include: { dimension: { select: { key: true, label: true } } },
    orderBy: { dimension: { key: 'asc' } },
  },
  evidence: {
    where: { type: EvidenceType.PHOTO, isPrivate: false },
    select: { id: true, url: true },
  },
  response: {
    include: {
      author: { select: { displayName: true } },
      business: { select: { name: true } },
    },
  },
  business: { select: { id: true, slug: true, name: true } },
  _count: { select: { helpfulVotes: true } },
} satisfies Prisma.ReviewInclude;

export type PublicReviewRow = Prisma.ReviewGetPayload<{
  include: typeof PUBLIC_REVIEW_INCLUDE;
}>;

/**
 * PRD v2.5 §6.4: five separate facts. Display text is fixed here so every client shows the same,
 * accurate statement. A review is never called a "verified purchase" (§7.6).
 */
export const LABELS: Record<string, ReviewLabelDto> = {
  account_verified: {
    key: 'account_verified',
    label: 'Account verified',
    description:
      "The reviewer's email address is verified. This does not prove a purchase.",
  },
  evidence_attached: {
    key: 'evidence_attached',
    label: 'Evidence attached',
    description:
      'The reviewer uploaded supporting evidence. TalkGround staff have not looked at it yet.',
  },
  evidence_reviewed: {
    key: 'evidence_reviewed',
    label: 'Evidence reviewed',
    description:
      'A TalkGround moderator examined the evidence attached to this review.',
  },
  under_investigation: {
    key: 'under_investigation',
    label: 'Under investigation',
    description:
      'This review has an open report or dispute that TalkGround is looking into.',
  },
};

export const RESOLUTION_LABELS: Record<ResolutionStatus, string> = {
  NONE: 'No resolution reported',
  BUSINESS_RESPONDED: 'Business has responded',
  RESOLUTION_PROPOSED: 'Resolution proposed by the business',
  RESOLVED_BY_CONSUMER: 'Resolved, as reported by the reviewer',
  REOPENED: 'Reopened by the reviewer',
};

export function isUnderInvestigation(r: {
  underInvestigation: boolean;
  status: ReviewStatus;
}) {
  return r.underInvestigation || r.status === ReviewStatus.UNDER_INVESTIGATION;
}

export function reviewLabels(r: {
  status: ReviewStatus;
  underInvestigation: boolean;
  evidenceAttached: boolean;
  evidenceStatus: EvidenceStatus;
  user: { emailVerified: boolean };
}): ReviewLabelDto[] {
  const labels: ReviewLabelDto[] = [];
  if (r.user.emailVerified) labels.push(LABELS.account_verified);
  if (r.evidenceAttached && r.evidenceStatus !== EvidenceStatus.ACCEPTED) {
    labels.push(LABELS.evidence_attached);
  }
  if (r.evidenceAttached && r.evidenceStatus === EvidenceStatus.ACCEPTED) {
    labels.push(LABELS.evidence_reviewed);
  }
  if (isUnderInvestigation(r)) labels.push(LABELS.under_investigation);
  return labels;
}

export function presentResponse(
  response: PublicReviewRow['response'],
): BusinessResponseDto | null {
  if (!response || response.status !== ResponseStatus.PUBLISHED) return null;
  return {
    id: response.id,
    body: response.body,
    label: `Response from ${response.business.name}`,
    businessName: response.business.name,
    representative: { displayName: response.author.displayName },
    createdAt: response.createdAt,
    editedAt: response.editedAt,
    edited: !!response.editedAt,
  };
}

export function presentReview(
  r: PublicReviewRow,
  opts: { helpfulByMe?: boolean | null; includeBusiness?: boolean } = {},
): ReviewDto {
  const deleted = !!r.user.deletedAt;
  return {
    id: r.id,
    ...(opts.includeBusiness
      ? {
          business: {
            id: r.business.id,
            slug: r.business.slug,
            name: r.business.name,
          },
        }
      : {}),
    reviewer: deleted
      ? {
          displayName: 'Former member',
          username: null,
          avatarUrl: null,
          emailVerified: false,
        }
      : {
          displayName: r.user.displayName,
          username: r.user.username,
          avatarUrl: r.user.avatarUrl,
          emailVerified: r.user.emailVerified,
        },
    overallRating: r.overallRating,
    dimensions: r.dimensionRatings.map((d) => ({
      key: d.dimension.key,
      label: d.dimension.label,
      value: d.value,
    })),
    title: r.title,
    body: r.body,
    recommend: r.recommend,
    status: r.status.toLowerCase(),
    evidenceAttached: r.evidenceAttached,
    evidenceStatus: r.evidenceStatus.toLowerCase(),
    underInvestigation: isUnderInvestigation(r),
    labels: reviewLabels(r),
    photos: r.evidence.map((e) => ({ id: e.id, url: e.url })),
    helpfulCount: r._count.helpfulVotes,
    helpfulByMe: opts.helpfulByMe ?? null,
    resolution: {
      status: r.resolutionStatus.toLowerCase(),
      label: RESOLUTION_LABELS[r.resolutionStatus],
    },
    response: presentResponse(r.response),
    createdAt: r.createdAt,
    publishedAt: r.publishedAt,
    editedAt: r.editedAt,
    edited: !!r.editedAt,
  };
}
