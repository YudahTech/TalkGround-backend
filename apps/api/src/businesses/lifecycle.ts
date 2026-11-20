import { BadRequestException } from '@nestjs/common';
import { BusinessStatus, OwnershipStatus } from '@prisma/client';
import type { OwnershipDto } from './businesses.responses';

/** PRD v2.5 §7.4 — the only allowed status transitions. */
const TRANSITIONS: Record<BusinessStatus, BusinessStatus[]> = {
  SUGGESTED: [BusinessStatus.PENDING_REVIEW],
  PENDING_REVIEW: [BusinessStatus.PUBLISHED, BusinessStatus.REJECTED],
  PUBLISHED: [
    BusinessStatus.SUSPENDED,
    BusinessStatus.MERGED,
    BusinessStatus.ARCHIVED,
  ],
  SUSPENDED: [
    BusinessStatus.PUBLISHED,
    BusinessStatus.MERGED,
    BusinessStatus.ARCHIVED,
  ],
  REJECTED: [],
  MERGED: [],
  ARCHIVED: [],
};

export function canTransition(
  from: BusinessStatus,
  to: BusinessStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BusinessStatus, to: BusinessStatus) {
  if (!canTransition(from, to)) {
    throw new BadRequestException(
      `A business cannot move from ${from.toLowerCase()} to ${to.toLowerCase()}. Allowed: ${
        TRANSITIONS[from].map((s) => s.toLowerCase()).join(', ') || 'none'
      }.`,
    );
  }
}

export const LISTING_DISCLAIMER =
  'A public listing does not mean TalkGround endorses or has verified this business.';

/**
 * Public ownership badge (PRD §7.3, §7.5). Verification confirms control of the profile, never
 * the quality or legitimacy of the business. A pending claim proves nothing, so it is shown as
 * unclaimed.
 */
export function ownershipBadge(
  status: OwnershipStatus,
  verified: boolean,
): OwnershipDto {
  if (status === OwnershipStatus.CLAIMED && verified) {
    return {
      status: 'claimed',
      ownershipVerified: true,
      label: 'Ownership verified',
      description:
        'TalkGround staff confirmed that the people managing this profile control the business. This is not an endorsement and says nothing about service quality.',
    };
  }
  if (status === OwnershipStatus.CLAIMED) {
    return {
      status: 'claimed',
      ownershipVerified: false,
      label: 'Claimed',
      description:
        'This profile is managed by a representative of the business. Ownership has not been verified.',
    };
  }
  return {
    status: 'unclaimed',
    ownershipVerified: false,
    label: 'Unclaimed',
    description: 'Nobody from this business manages this profile yet.',
  };
}
