import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Opaque random token for refresh/reset links (URL-safe, 256-bit). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hash used to store high-entropy tokens (refresh, reset). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * HMAC for short one-time codes (6-digit OTPs). A plain hash of a 6-digit code is
 * trivially reversible, so codes are keyed with the server secret.
 */
export function hmacCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Read a boolean env var ("true"/"false"), falling back to `fallback` when unset. */
export function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

/** Parse durations like "15m", "7d", "3600s", "12h" into milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) return 15 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2] ?? 's';
  const factor = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    unit
  ]!;
  return n * factor;
}
