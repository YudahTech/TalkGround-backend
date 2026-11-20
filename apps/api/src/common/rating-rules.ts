import { Prisma, ReviewStatus } from '@prisma/client';

/**
 * Public, versioned rating rules (PRD §7.12 rule 7). Change the version and the text together;
 * GET /meta/rating-methodology publishes them.
 */
export const RATING_METHODOLOGY_VERSION = '1.0';

/** A rating is only shown as a number once a business has this many eligible reviews (PRD §7.12 rules 3–4). */
export const MIN_REVIEWS_FOR_RATING = 5;

/** Reviews anyone can read. */
export const PUBLIC_REVIEW_STATUSES: ReviewStatus[] = [
  ReviewStatus.PUBLISHED,
  ReviewStatus.UNDER_INVESTIGATION,
];

/**
 * Reviews counted in ratings: public, and the author's current review of that business
 * (an earlier experience superseded by a newer review stays visible but no longer counts).
 */
export const ELIGIBLE_REVIEW_WHERE: Prisma.ReviewWhereInput = {
  status: { in: PUBLIC_REVIEW_STATUSES },
  supersededAt: null,
};

export const RATING_METHODOLOGY = {
  version: RATING_METHODOLOGY_VERSION,
  effectiveFrom: '2026-11-20',
  rules: [
    'The overall rating is the plain average (mean) of the overall star ratings of eligible reviews, rounded to one decimal place.',
    "Eligible reviews are published reviews, including reviews marked under investigation, that are the reviewer's current review of the business. If a reviewer writes about a newer experience, their earlier review stays visible but no longer counts.",
    'Reviews awaiting moderation, removed by moderators or withdrawn by their author are not counted.',
    `A numeric rating is only shown once a business has at least ${MIN_REVIEWS_FOR_RATING} eligible reviews. Below that, the profile shows an insufficient-data message with the review count.`,
    'The number of reviews is always shown alongside the rating, together with the distribution of 1 to 5 star reviews.',
    'Each rating dimension (for example Communication) is the average of the scores reviewers gave for that dimension. Reviewers only rate dimensions that apply to the business category and may skip optional ones, so each dimension shows its own count.',
    'Ownership claims and verification, business responses, resolution statuses, helpful votes and evidence labels never change the rating.',
    'Businesses cannot pay to change their rating or ranking. TalkGround does not use a hidden or AI-generated trust score.',
    'Any change to these rules is published here with a new version number.',
  ],
};

export function roundRating(value: number | null | undefined): number | null {
  return value === null || value === undefined
    ? null
    : Math.round(value * 10) / 10;
}

/** The rating block shown on profiles and search results. */
export function ratingSummary(reviewCount: number, average: number | null) {
  const sufficient = reviewCount >= MIN_REVIEWS_FOR_RATING;
  return {
    reviewCount,
    average: sufficient ? roundRating(average) : null,
    sufficientData: sufficient,
    message: sufficient
      ? null
      : reviewCount === 0
        ? 'No reviews yet'
        : `Not enough reviews for a reliable rating yet (${reviewCount} of ${MIN_REVIEWS_FOR_RATING} needed)`,
    minimumReviews: MIN_REVIEWS_FOR_RATING,
  };
}
