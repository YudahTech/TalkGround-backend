import { BusinessStatus, OwnershipStatus } from '@prisma/client';

/**
 * PRD §7.4 listing lifecycle, derived from two independent columns.
 * "suggested" lives in BusinessSubmission (a suggestion is not yet a listing), so a Business
 * row starts at "pending_review" at the earliest.
 */
export type LifecycleStage =
  | 'suggested'
  | 'pending_review'
  | 'published_unclaimed'
  | 'claim_pending'
  | 'claimed_managed'
  | 'ownership_verified'
  | 'suspended'
  | 'merged'
  | 'archived';

export function lifecycleStage(b: {
  status: BusinessStatus;
  ownershipStatus: OwnershipStatus;
}): LifecycleStage {
  switch (b.status) {
    case BusinessStatus.PENDING_REVIEW:
      return 'pending_review';
    case BusinessStatus.SUSPENDED:
      return 'suspended';
    case BusinessStatus.MERGED:
      return 'merged';
    case BusinessStatus.ARCHIVED:
      return 'archived';
  }
  switch (b.ownershipStatus) {
    case OwnershipStatus.CLAIM_PENDING:
      return 'claim_pending';
    case OwnershipStatus.CLAIMED:
      return 'claimed_managed';
    case OwnershipStatus.VERIFIED:
      return 'ownership_verified';
    default:
      return 'published_unclaimed';
  }
}

/**
 * Public ownership badge (PRD §7.3, §7.5). The wording is deliberate: verification confirms
 * control of the profile, never the quality or legitimacy of the business.
 */
export function ownershipBadge(status: OwnershipStatus) {
  switch (status) {
    case OwnershipStatus.VERIFIED:
      return {
        status: 'ownership_verified',
        label: 'Ownership verified',
        description:
          'TalkGround confirmed that the people managing this profile control the business. This is not an endorsement and says nothing about service quality.',
      };
    case OwnershipStatus.CLAIMED:
      return {
        status: 'claimed',
        label: 'Claimed',
        description:
          'This profile is managed by a representative of the business. Ownership has not been fully verified.',
      };
    default:
      // CLAIM_PENDING is shown publicly as unclaimed: a pending request proves nothing yet.
      return {
        status: 'unclaimed',
        label: 'Unclaimed',
        description:
          'Nobody from this business manages this profile yet. Listing a business does not mean TalkGround endorses it.',
      };
  }
}
