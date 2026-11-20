import {
  EvidenceKind,
  EvidenceStatus,
  Prisma,
  ResolutionStatus,
  ResponseStatus,
  ReviewStatus,
  VoteValue,
} from '@prisma/client';

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
  dimensions: {
    include: { dimension: { select: { key: true, name: true } } },
  },
  evidence: {
    where: { status: { not: EvidenceStatus.REJECTED } },
    select: { id: true, kind: true, url: true, isPrivate: true, status: true },
  },
  response: {
    include: {
      author: { select: { displayName: true } },
      business: { select: { name: true } },
    },
  },
  business: { select: { id: true, slug: true, name: true } },
  _count: {
    select: {
      helpfulVotes: { where: { value: VoteValue.HELPFUL } },
    },
  },
} satisfies Prisma.ReviewInclude;

export type PublicReviewRow = Prisma.ReviewGetPayload<{
  include: typeof PUBLIC_REVIEW_INCLUDE;
}>;

/**
 * PRD §6.4 / §7.6: four labels that are never interchangeable. Each carries the exact
 * statement of what was (and was not) verified so the frontend can show it verbatim.
 */
export const REVIEW_LABELS = {
  account_verified: {
    key: 'account_verified',
    label: 'Account verified',
    description:
      'The reviewer confirmed their email address. This does not prove they bought from or used this business.',
  },
  evidence_attached: {
    key: 'evidence_attached',
    label: 'Evidence attached',
    description:
      'The reviewer attached supporting evidence. TalkGround has not examined it.',
  },
  evidence_reviewed: {
    key: 'evidence_reviewed',
    label: 'Evidence reviewed',
    description:
      'A TalkGround moderator examined the evidence attached to this review and found it consistent with the experience described.',
  },
  under_investigation: {
    key: 'under_investigation',
    label: 'Under investigation',
    description:
      'TalkGround is looking into this review. It stays visible while we investigate.',
  },
} as const;

export const RESOLUTION_LABELS: Record<ResolutionStatus, string> = {
  NONE: 'No resolution reported',
  BUSINESS_RESPONDED: 'Business has responded',
  RESOLUTION_PROPOSED: 'Resolution proposed by the business',
  RESOLVED_BY_CONSUMER: 'Resolution reported by the reviewer',
  DISPUTE_REOPENED: 'Reopened by the reviewer',
};

export function reviewLabels(r: {
  status: ReviewStatus;
  user: { emailVerified: boolean };
  evidence: { status: EvidenceStatus }[];
}) {
  const labels: (typeof REVIEW_LABELS)[keyof typeof REVIEW_LABELS][] = [];
  if (r.user.emailVerified) labels.push(REVIEW_LABELS.account_verified);
  if (r.evidence.length) labels.push(REVIEW_LABELS.evidence_attached);
  if (r.evidence.some((e) => e.status === EvidenceStatus.ACCEPTED)) {
    labels.push(REVIEW_LABELS.evidence_reviewed);
  }
  if (r.status === ReviewStatus.UNDER_INVESTIGATION) {
    labels.push(REVIEW_LABELS.under_investigation);
  }
  return labels;
}

export function presentResponse(response: PublicReviewRow['response']) {
  if (!response || response.status !== ResponseStatus.PUBLISHED) return null;
  return {
    id: response.id,
    body: response.body,
    label: `Official response from ${response.business.name}`,
    businessName: response.business.name,
    representative: {
      displayName: response.author.displayName,
      role: 'Business representative',
    },
    createdAt: response.createdAt,
    editedAt: response.editedAt,
    edited: !!response.editedAt,
  };
}

export function presentReview(
  r: PublicReviewRow,
  opts: { myVote?: VoteValue | null; includeBusiness?: boolean } = {},
) {
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
    author: deleted
      ? { displayName: 'Former member', username: null, avatarUrl: null }
      : {
          displayName: r.user.displayName,
          username: r.user.username,
          avatarUrl: r.user.avatarUrl,
        },
    overallRating: r.overallRating,
    dimensions: r.dimensions.map((d) => ({
      key: d.dimension.key,
      name: d.dimension.name,
      score: d.score,
    })),
    title: r.title,
    body: r.body,
    experienceDate: r.experienceDate,
    status: r.status.toLowerCase(),
    earlierExperience: !!r.supersededAt,
    labels: reviewLabels(r),
    photos: r.evidence
      .filter((e) => e.kind === EvidenceKind.PHOTO && !e.isPrivate)
      .map((e) => ({ id: e.id, url: e.url })),
    evidenceCount: r.evidence.length,
    helpfulCount: r._count.helpfulVotes,
    myVote: opts.myVote ? opts.myVote.toLowerCase() : null,
    resolution: {
      status: r.resolutionStatus.toLowerCase(),
      label: RESOLUTION_LABELS[r.resolutionStatus],
    },
    response: presentResponse(r.response),
    createdAt: r.createdAt,
    publishedAt: r.publishedAt,
    editedAt: r.editedAt,
    edited: !!r.editedAt,
    editCount: r.editCount,
  };
}
