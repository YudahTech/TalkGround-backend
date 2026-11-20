import { BadRequestException } from '@nestjs/common';
import { IdentifierType } from '@prisma/client';

/** Identifier types that may belong to only one business (duplicate detection, PRD §7.2/§7.3). */
export const UNIQUE_IDENTIFIER_TYPES: IdentifierType[] = [
  IdentifierType.INSTAGRAM,
  IdentifierType.TIKTOK,
  IdentifierType.FACEBOOK,
  IdentifierType.X,
  IdentifierType.WHATSAPP,
  IdentifierType.WEBSITE,
  IdentifierType.PHONE,
  IdentifierType.EMAIL,
  IdentifierType.CAC_NUMBER,
];

/** Identifier types that are social accounts (owners manage these as "public business links"). */
export const SOCIAL_IDENTIFIER_TYPES: IdentifierType[] = [
  IdentifierType.INSTAGRAM,
  IdentifierType.TIKTOK,
  IdentifierType.FACEBOOK,
  IdentifierType.X,
  IdentifierType.WHATSAPP,
];

const SOCIAL_HOSTS: Partial<Record<IdentifierType, RegExp>> = {
  INSTAGRAM: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i,
  TIKTOK: /^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@?/i,
  FACEBOOK: /^(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\//i,
  X: /^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\//i,
};

/** "+2348012345678" from "08012345678", "2348012345678" or "+234 801 234 5678". Null otherwise. */
export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let national: string | null = null;
  if (/^\+234\d{10}$/.test(digits)) national = digits.slice(4);
  else if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  return national ? `+234${national}` : null;
}

/** Lowercase host without "www.", e.g. "https://www.Shop.ng/about" → "shop.ng". */
export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase();
  try {
    const url = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** Lowercase, accent-free, punctuation-free name used for duplicate comparison. */
export function normalizeName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Canonical form of an identifier, used for search and duplicate detection.
 * Throws 400 for values that can't be a valid identifier of that type.
 */
export function normalizeIdentifier(
  type: IdentifierType,
  value: string,
): string {
  const v = value.trim();
  if (!v) throw new BadRequestException(`${type} identifier is empty`);
  switch (type) {
    case IdentifierType.INSTAGRAM:
    case IdentifierType.TIKTOK:
    case IdentifierType.FACEBOOK:
    case IdentifierType.X: {
      const handle = v
        .replace(SOCIAL_HOSTS[type]!, '')
        .replace(/^@/, '')
        .split(/[/?#]/)[0]
        .toLowerCase();
      if (!/^[a-z0-9._-]{1,60}$/.test(handle)) {
        throw new BadRequestException(
          `Invalid ${type.toLowerCase()} handle: ${v}`,
        );
      }
      return handle;
    }
    case IdentifierType.WEBSITE: {
      const domain = normalizeDomain(v);
      if (!domain) throw new BadRequestException(`Invalid website: ${v}`);
      return domain;
    }
    case IdentifierType.PHONE:
    case IdentifierType.WHATSAPP: {
      const phone = normalizeNigerianPhone(
        v.replace(/^(?:https?:\/\/)?wa\.me\//i, ''),
      );
      if (!phone) {
        throw new BadRequestException(`Invalid Nigerian phone number: ${v}`);
      }
      return phone;
    }
    case IdentifierType.EMAIL: {
      const email = v.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException(`Invalid email: ${v}`);
      }
      return email;
    }
    case IdentifierType.CAC_NUMBER: {
      const rc = v.toUpperCase().replace(/[\s-]/g, '');
      if (!/^(RC|BN|IT|LP|LLP)?\d{4,10}$/.test(rc)) {
        throw new BadRequestException(`Invalid CAC registration number: ${v}`);
      }
      return rc;
    }
    case IdentifierType.ALTERNATIVE_NAME: {
      const name = normalizeName(v);
      if (!name) throw new BadRequestException(`Invalid name: ${v}`);
      return name;
    }
    default:
      return v.toLowerCase().slice(0, 200);
  }
}

export function identifierUniqueKey(
  type: IdentifierType,
  normalized: string,
): string | null {
  return UNIQUE_IDENTIFIER_TYPES.includes(type)
    ? `${type}:${normalized}`
    : null;
}

/** Text the search index stores for an identifier. Handles are searchable with or without "@". */
export function identifierSearchTerms(
  type: IdentifierType,
  value: string,
  normalized: string,
): string {
  switch (type) {
    case IdentifierType.CAC_NUMBER:
    case IdentifierType.PHONE:
    case IdentifierType.WHATSAPP:
    case IdentifierType.EMAIL:
    case IdentifierType.WEBSITE:
      return normalized;
    case IdentifierType.INSTAGRAM:
    case IdentifierType.TIKTOK:
    case IdentifierType.FACEBOOK:
    case IdentifierType.X:
      return `${normalized} @${normalized}`;
    default:
      return `${value} ${normalized}`;
  }
}
