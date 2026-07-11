# Revyu — Implementation Status

**Last updated:** 15 June 2026

## Phase 0 — Survey + Waitlist + Docs ✅

| Item | Status |
|---|---|
| PRD v1.0 | ✅ `docs/PRD-v1.0.md` |
| API Specification | ✅ `docs/API-SPECIFICATION.md` |
| Wireframe Brief | ✅ `docs/WIREFRAME-BRIEF.md` |
| Admin Moderation SOP | ✅ `docs/ADMIN-MODERATION-SOP.md` |
| Survey Instrument | ✅ `docs/SURVEY-INSTRUMENT.md` + `/survey` page |
| Waitlist Instrument | ✅ `docs/WAITLIST-INSTRUMENT.md` + `/waitlist` page |
| Investor One-Pager | ✅ `docs/INVESTOR-ONE-PAGER.md` |

## Phase 1 — Auth, Brands, Text Reviews ✅

| Item | Status |
|---|---|
| NestJS API scaffold | ✅ |
| Prisma schema | ✅ |
| Auth (register/login/OTP) | ✅ |
| Brand listing + detail | ✅ |
| Write/read reviews (text) | ✅ |
| Frontend pages | ✅ |

## Phase 2 — Photos, Profiles, Reports ✅

| Item | Status |
|---|---|
| User public profile | ✅ |
| My reviews dashboard | ✅ |
| Cloudinary photo/receipt upload | ✅ |
| Report review button | ✅ |

## Phase 3 — Trust Flagging + Admin ✅

| Item | Status |
|---|---|
| IP / pattern / velocity flags | ✅ |
| Admin dashboard | ✅ |
| Moderation queues | ✅ |
| Admin SOP document | ✅ |

## Phase 4 — Receipt + Brand Suggestions ✅

| Item | Status |
|---|---|
| Receipt upload (URL) | ✅ |
| Verified visit badge | ✅ Admin verify flow |
| Brand suggestions | ✅ |
| Legal pages | ✅ Terms, Privacy, Guidelines |

## Pending / Post-MVP

- Resend email production config
- Redis rate limiting (in-memory fallback in dev)
- Edit review pre-fill on `/review/[slug]`
