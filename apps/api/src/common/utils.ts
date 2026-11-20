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
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

export function lower(value: string): string {
  return value.toLowerCase();
}

export function excerpt(text: string, max = 160): string {
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

/** Trim and collapse whitespace; strips ASCII control characters (stored text is rendered as plain text). */
export function cleanText(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
