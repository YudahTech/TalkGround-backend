# Revyu — Product Requirements Document v1.0

**Version:** 1.0  
**Date:** 15 June 2026  
**Launch target:** 1 August 2026  
**Team:** 2 developers, founders-only moderation  
**Status:** Approved for development

---

## 1. Executive Summary

Revyu is a trust-first review platform for **restaurants and hotels** in **Lagos and Abuja**. MVP success is defined as:

> Can someone find a Nigerian brand, read credible reviews, and leave a review?

**Positioning:** City-level density + receipt-verified reviews + structured moderation. Not the first Nigerian review platform — the first to earn trust at local depth.

---

## 2. Locked Decisions

| Area | Decision |
|---|---|
| Vertical | Restaurants + Hotels & Stays (hotels, guest houses, short-lets) |
| Geography | Lagos + Abuja |
| Brands | Admin-seeded + user suggestions (admin approves) |
| Review rule | One review per user per brand, fully editable |
| Identity | Display name + username handle; email/phone never public |
| Negative reviews | Allowed without receipt; min 50 chars; auto-flag new accounts |
| Receipt | Optional; image private; "Verified visit" badge on admin approval |
| Monetization | Free MVP; brand subscription later |
| Moderation | Founders only at launch |
| Survey incentive | None |
| Legal | CAC registration before public launch; ToS/Privacy/Guidelines required |

---

## 3. Target Users

1. **Newcomer** — new to Lagos/Abuja, needs trusted food/stay recommendations  
2. **Busy professional** — eats out often, wants fast reliable answers  
3. **Contributor** — writes reviews after notable experiences; may upload photos/receipt  

---

## 4. MVP Pages

| Route | Page | Auth |
|---|---|---|
| `/` | Home | Public |
| `/brands` | Brand listing | Public |
| `/brand/{slug}` | Brand detail | Public |
| `/category/restaurants` | Restaurants | Public |
| `/category/hotels` | Hotels & stays | Public |
| `/login` | Login | Public |
| `/register` | Sign up | Public |
| `/forgot-password` | Forgot password | Public |
| `/review/{slug}` | Write review | Required |
| `/u/{username}` | Public profile | Public |
| `/dashboard/reviews` | My reviews | Required |
| `/suggest-brand` | Suggest brand | Required |
| `/admin` | Admin dashboard | Admin |
| `/admin/brands` | Brand management | Admin |
| `/admin/reviews` | Review moderation | Admin |
| `/admin/suggestions` | Brand suggestions | Admin |
| `/survey` | Validation survey | Public |
| `/waitlist` | Launch waitlist | Public |
| `/terms` | Terms of Service | Public |
| `/privacy` | Privacy Policy | Public |
| `/review-guidelines` | Review Guidelines | Public |

---

## 5. Functional Requirements

### 5.1 Reviews

- Fields: rating (1–5), title, body (min 50 chars), pros, cons, recommend (yes/no)
- Up to 3 photos; 1 optional receipt (private)
- States: `published`, `pending_verification`, `flagged`, `suspended`, `removed`
- Sort on brand page: Recent, Highest, Lowest, Verified first
- Edit/delete by owner; show posted + last edited dates
- One review per user per brand

### 5.2 Trust & Anti-Fraud

- Email + phone OTP required before first review
- Rate limit: 3 reviews per user per 24 hours
- IP hash flagging: >2 accounts same IP in 7 days → flag
- Duplicate text hash → flag
- Velocity: >5 reviews on one brand in 1 hour → flag
- New account (<24h) + 1-star → flag
- User report flow with reason codes
- Founder moderation SLA: 48 hours

### 5.3 Admin

- Brand CRUD; approve user suggestions
- Moderation queues: reported, flagged, pending receipt, suspended
- Receipt verification → verified visit badge
- User account suspension

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | NestJS, Prisma |
| Database | PostgreSQL |
| Images | Cloudinary |
| Cache / rate limits | Redis (Upstash) |
| SMS OTP | Termii |
| Email | Resend |
| Hosting | Vercel (web), Railway/Render (api) |

---

## 7. Success Metrics (90 days)

| Metric | Target |
|---|---|
| Brands listed | 200+ |
| Published reviews | 500+ |
| Receipt-verified reviews | ≥10% |
| Reviews with photos | ≥20% |
| Waitlist → registered | ≥30% |
| Moderation SLA | <48h |

---

## 8. Out of Scope (MVP)

AI summaries, chatbots, social feed, following, native mobile apps, brand claiming, notifications, messaging, influencer layer, payments, recommendation engine.

---

## 9. Implementation Phases

| Phase | Deliverable | Target |
|---|---|---|
| 0 | Survey + Waitlist + docs | 22 Jun 2026 |
| 1 | Auth, brands, text reviews | 6 Jul 2026 |
| 2 | Photos, profiles, reports | 13 Jul 2026 |
| 3 | Flagging + admin moderation | 20 Jul 2026 |
| 4 | Receipt verification + suggestions | 27 Jul 2026 |
| Launch | Soft launch 28 Jul; public 1 Aug | 1 Aug 2026 |

---

## 10. Related Documents

- [API Specification](./API-SPECIFICATION.md)
- [Wireframe Brief](./WIREFRAME-BRIEF.md)
- [Admin Moderation SOP](./ADMIN-MODERATION-SOP.md)
- [Survey Instrument](./SURVEY-INSTRUMENT.md)
- [Waitlist Instrument](./WAITLIST-INSTRUMENT.md)
- [Investor One-Pager](./INVESTOR-ONE-PAGER.md)
