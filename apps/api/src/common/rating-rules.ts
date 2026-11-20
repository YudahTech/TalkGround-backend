import { Prisma, ReviewStatus } from '@prisma/client';

/**
 * Public, versioned rating rules (PRD v2.5 §7.12). Any change to the calculation MUST bump the
 * version and be described in docs/API-CHANGELOG. Published at GET /meta/rating-methodology.
 */
export const RATING_METHODOLOGY_VERSION = '2.0';

/** Reviews anyone can read (author-deleted reviews are hidden). */
export const VISIBLE_REVIEW_WHERE: Prisma.ReviewWhereInput = {
  status: { in: [ReviewStatus.PUBLISHED, ReviewStatus.UNDER_INVESTIGATION] },
  deletedAt: null,
};

/** Reviews counted in ratings: PUBLISHED only (§7.12), not deleted. */
export const RATED_REVIEW_WHERE: Prisma.ReviewWhereInput = {
  status: ReviewStatus.PUBLISHED,
  deletedAt: null,
};

export const INSUFFICIENT_DATA_MESSAGE = 'Not enough reviews yet';

export function ratingMethodology(minReviews: number) {
  return {
    version: RATING_METHODOLOGY_VERSION,
    effectiveFrom: '2026-11-21',
    minimumReviews: minReviews,
    rules: [
      'The overall rating is the average (mean) of the overall star ratings of published reviews, rounded to one decimal place.',
      'Reviews that are pending moderation, under investigation by a moderator, suspended, removed or deleted by their author are not counted.',
      `If a business has fewer than ${minReviews} published reviews, the profile shows "${INSUFFICIENT_DATA_MESSAGE}" instead of a star average.`,
      'The number of reviews is always shown next to the rating, together with the count of 1 to 5 star reviews.',
      'Each dimension average (for example Delivery) uses only the published reviews that rated that dimension, and shows its own count.',
      'Ownership claims, ownership verification, business responses, resolution status, helpful votes and evidence never change the rating or the order of search results.',
      'Businesses cannot pay to change their rating, ranking or search visibility. TalkGround shows no hidden or AI-generated trust score.',
      'Internal anti-spam checks can only send a new review to a moderator before it is published. They never change ratings or what is shown.',
      'Any change to these rules is published here with a new version number.',
    ],
  };
}

export function roundRating(value: number | null | undefined): number | null {
  return value === null || value === undefined
    ? null
    : Math.round(value * 10) / 10;
}

/** The rating block shown on profiles and search results. */
export function ratingSummary(
  reviewCount: number,
  average: number | null,
  minReviews: number,
) {
  const sufficient = reviewCount >= minReviews;
  return {
    reviewCount,
    average: sufficient ? roundRating(average) : null,
    sufficientData: sufficient,
    message: sufficient ? null : INSUFFICIENT_DATA_MESSAGE,
    minimumReviews: minReviews,
  };
}
