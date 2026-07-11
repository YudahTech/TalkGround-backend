import { createHash, randomInt } from 'crypto';

export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

export function hashReviewText(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

export function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function toApiCity(city: string): string {
  return city.toLowerCase();
}

export function toApiCategory(category: string): string {
  return category.toLowerCase();
}

export function categoryLabel(category: string): string {
  if (category === 'RESTAURANTS') return 'Dining';
  if (category === 'HOTELS') return 'Hotels';
  return category.toLowerCase();
}

export function formatRelativeDate(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return '1 week ago';
  if (weeks < 5) return `${weeks} weeks ago`;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function computeTrustScore(input: {
  averageRating: number;
  reviewCount: number;
  verifiedCount: number;
  claimed: boolean;
}): { score: number; label: string } {
  const { averageRating, reviewCount, verifiedCount, claimed } = input;
  if (reviewCount === 0) {
    return { score: 0, label: 'No reviews yet' };
  }

  const ratingScore = (averageRating / 5) * 50;
  const volumeScore = Math.min(reviewCount / 50, 1) * 25;
  const verifiedRatio = verifiedCount / reviewCount;
  const verifiedScore = verifiedRatio * 15;
  const claimedScore = claimed ? 10 : 0;
  const score = Math.round(ratingScore + volumeScore + verifiedScore + claimedScore);

  let label = 'Fair';
  if (score >= 85) label = 'Excellent';
  else if (score >= 70) label = 'Very Good';
  else if (score >= 55) label = 'Good';

  return { score: Math.min(score, 100), label };
}

export function ratingDistributionPercentages(breakdown: Record<number, number>, total: number) {
  if (!total) {
    return { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  }
  return {
    5: Math.round((breakdown[5] / total) * 100),
    4: Math.round((breakdown[4] / total) * 100),
    3: Math.round((breakdown[3] / total) * 100),
    2: Math.round((breakdown[2] / total) * 100),
    1: Math.round((breakdown[1] / total) * 100),
  };
}
