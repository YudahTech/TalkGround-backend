# TalkGround — Frontend Integration Guide (API v2.0)

**Audience:** frontend developers · **Last updated:** 20 November 2026 · **API version:** 2.0
**Base URL (live):** `https://revyu-backend.onrender.com/api/v1` · **Local:** `http://localhost:3001/api/v1`
**Swagger:** https://revyu-backend.onrender.com/docs (every request/response schema, with examples)

> **Read first:** [FRONTEND-AUTH.md](./FRONTEND-AUTH.md) — sessions are HttpOnly cookies. Send every request with
> `credentials: 'include'`; there are no tokens and no `Authorization` header.

> **v2.0 is a breaking release.** TalkGround is now a general business-reputation platform (PRD), not a
> restaurants/hotels app. `/brands`, `/home`, `/brand-suggestions` and the `rating`/`trustScore` fields are gone.
> See §1 for the mapping.

---

## 1. What changed from v1

| v1 | v2 |
|---|---|
| `GET /home`, `GET /brands`, `GET /brands/filters` | `GET /businesses` (search + filters), `GET /categories`, `GET /locations` |
| `GET /brands/:slug`, `/brands/:slug/reviews` | `GET /businesses/:slug`, `GET /businesses/:slug/reviews` |
| `GET /brands/:slug/context` | Gone. `POST /reviews` returns `409` with `reviewId` when you already reviewed; `GET /users/me/reviews` lists yours |
| Categories RESTAURANTS/HOTELS, cities LAGOS/ABUJA (enums) | 6 categories from `GET /categories` (more can be added without a release); all 37 states from `GET /locations` |
| Review: `rating`, `title`, `body`, `pros`, `cons`, `recommend` | Review: `overallRating`, **`dimensions`** (per category), `title?`, `body`, `experienceDate?` |
| `trustScore`, `trustLabel`, `claimed` | **Removed** (PRD: no unexplained trust score). Use `rating` and `ownership` blocks |
| `POST /reviews/:id/helpful` (toggle) | `PUT /reviews/:id/vote {helpful: true|false}`, `DELETE /reviews/:id/vote` |
| `POST /reviews/:id/report` | `POST /reviews/:id/reports` (new reasons) |
| `POST /reviews/:id/media` | `POST /reviews/:id/evidence` (new kinds + upload folders) |
| `POST /brand-suggestions` | `POST /business-submissions` |
| `user.role`, `user.city`, `user.interests` | `user.isStaff`, `user.staffRole`, `user.permissions`, `user.location` |
| Phone verification required to review | Only a **verified email** is required |
| Admin `role: ADMIN/MODERATOR` | Staff roles with fine-grained permissions (`user.permissions`) |

New in v2: business owners (claims, dashboard, official responses, resolution, disputes, share links), rating
dimensions, evidence labels, duplicate merging, full admin/moderation suite.

---

## 2. Conventions

- **Envelope:** `{ "data": ... }`; lists add `"meta": { page, limit, total, totalPages }`. Pagination: `?page=1&limit=20` (max 50).
- **Errors:** `{ "error": { "code": "BAD_REQUEST", "message": "..." } }`. Show `error.message` — it is written for users.
- **Enums:** responses are **lowercase** (`"published"`, `"business_email"`). Requests accept any case.
- **Unknown fields are rejected** with `400` (strict validation). Send only documented fields.
- **IDs** are UUIDs; public pages use **slugs** (`/businesses/kemi-s-closet`).
- **Text** is stored as plain text. Render it as text, never as HTML.

| Status | Meaning | What to do |
|---|---|---|
| 400 | Validation failed / rule broken | Show `error.message` |
| 401 | Not signed in / session expired | Refresh once (see auth guide), then go to login |
| 403 | Not allowed (e.g. email not verified, not the owner, staff permission missing) | Show `error.message`; for "Verify your email" send to verification |
| 404 | Not found (also: unpublished/suspended businesses) | Empty state |
| 409 | Conflict: duplicate review/claim/report/response, existing business | Show message; many 409s include a link target (below) |
| 429 | Rate limited / account locked | Show message, retry later |
| 503 | Uploads not configured (Cloudinary) | Hide upload UI |

**409s that carry data:**
- `POST /reviews` → `{ message, reviewId }` — send the user to edit their existing review.
- `POST /business-submissions` → `{ message, business: { slug, name } }` — "This business is already listed".

---

## 3. Core concepts the UI must get right

### 3.1 Categories and rating dimensions

`GET /categories` returns each category with its `ratingDimensions` (`key`, `name`, `description`, `required`).
**Build the review form from this list** — never hard-code dimensions. Required dimensions must be sent;
optional ones (e.g. Delivery for restaurants) may be skipped ("Not applicable").

Current categories: `fashion-clothing`, `beauty-skincare-hair`, `electronics-gadgets`, `food-restaurants`,
`logistics-delivery`, `general-services`.

### 3.2 Ratings (PRD §7.12)

Every business carries a `rating` block:

```json
{
  "reviewCount": 2,
  "average": null,
  "sufficientData": false,
  "message": "Not enough reviews for a reliable rating yet (2 of 5 needed)",
  "minimumReviews": 5,
  "distribution": [{ "stars": 5, "count": 1, "percent": 50 }, ...],
  "dimensions": [{ "key": "communication", "name": "Communication", "reviewCount": 2, "average": null, "sufficientData": false }]
}
```

Rules for the UI:
- **Always show `reviewCount` next to any rating.**
- When `sufficientData` is `false`, `average` is `null` — show `message` instead of stars.
- Never compute your own average. Link "How ratings work" to `GET /meta/rating-methodology` (versioned rules).
- There are no rankings or "top rated" lists in the MVP (PRD). `sort=rating` on search is fine.

### 3.3 Review labels — show them exactly

Each review has `labels: [{ key, label, description }]`. Possible keys:

| key | label | meaning |
|---|---|---|
| `account_verified` | Account verified | Reviewer confirmed their email. **Not** proof of purchase. |
| `evidence_attached` | Evidence attached | Reviewer attached evidence; TalkGround has **not** examined it. |
| `evidence_reviewed` | Evidence reviewed | A moderator examined the evidence. |
| `under_investigation` | Under investigation | TalkGround is looking into this review (still visible). |

The PRD requires these never be merged into one "verified" badge. Use the provided `label` + `description`
(tooltip) verbatim. `earlierExperience: true` marks an older review superseded by the same person's newer one.

### 3.4 Ownership badge

`ownership: { status, label, description }` where status is `unclaimed`, `claimed` or `ownership_verified`.
Show the `description` — ownership confirms control of the profile, **not** business quality.
`underInvestigation` on a business (object with `label`, `note`) must be shown prominently on the profile.

### 3.5 Business responses and resolution

- `review.response` (or `null`): `{ body, label: "Official response from X", representative: { displayName, role }, createdAt, edited }`.
  Show it under the review, clearly marked as the business's official response.
- `review.resolution: { status, label }` — `none`, `business_responded`, `resolution_proposed`,
  `resolved_by_consumer`, `dispute_reopened`. Only the **reviewer** can mark `resolved`/`reopened`
  (`POST /reviews/:id/resolution`); a business can only propose. Resolution never changes the rating.

---

## 4. Screens → endpoints

### 4.1 Discover (no account needed)

| UI | Call |
|---|---|
| Search box / results | `GET /businesses?q=&category=&state=&city=&minRating=&sort=relevance|most_reviewed|rating&page=` |
| Category chips | `GET /categories` |
| State filter | `GET /locations` (37 states with counts; slug e.g. `lagos`, `fct`) |
| Business profile | `GET /businesses/:slug` (includes 5 recent reviews) |
| All reviews | `GET /businesses/:slug/reviews?sort=recent|helpful|rating_high|rating_low&stars=1..5` |
| One review (share page) | `GET /reviews/:id` (adds `resolutionHistory`) |
| Reviewer profile | `GET /users/:username` |

`q` matches names, alternative names, social handles (`@kemis_closet` or `kemis_closet`), websites
(`kemiscloset.ng`), phone numbers in any format, CAC numbers, category and location. Partial words work.

If `GET /businesses/:slug` returns `{ data: { merged: true, mergedInto: { slug } } }`, redirect to the new slug.

### 4.2 Write a review (signed in + verified email)

1. `GET /categories/:slug` → dimensions for the business's category.
2. `POST /reviews`:

```json
{
  "businessId": "uuid",
  "overallRating": 4,
  "dimensions": [
    { "key": "product_service_quality", "score": 5 },
    { "key": "value_for_money", "score": 4 }
  ],
  "title": "Great fabric, slow delivery",
  "body": "At least 30 characters describing the experience...",
  "experienceDate": "2026-11-02"
}
```

3. Response `data.moderation` is a message when the review was held for a quick check (status `pending_moderation`,
   visible only to the author); otherwise `null` and the review is live.
4. Optional evidence: upload (§5), then `POST /reviews/:id/evidence { kind, url }`.

Rules: one current review per business (`409` + `reviewId` → offer "Edit your review"). After 90 days the person
may review a new experience with `newExperience: true`. Max 3 new reviews / 24h. Business representatives cannot
review their own business.

My reviews: `GET /users/me/reviews` (all statuses, `editsRemaining`). Edit: `PATCH /reviews/:id` (max 5 edits,
history at `GET /reviews/:id/revisions`). Withdraw: `DELETE /reviews/:id`.

### 4.3 Interact with reviews (signed in)

| Action | Call |
|---|---|
| Helpful / not helpful | `PUT /reviews/:id/vote { "helpful": true }` → `{ myVote, helpfulCount }` |
| Remove vote | `DELETE /reviews/:id/vote` |
| Report | `POST /reviews/:id/reports { reason, details? }` — reasons: `false_experience`, `spam_promotional`, `personal_information`, `harassment_abuse`, `conflict_of_interest`, `impersonation`, `other_policy_violation` |
| Reviewer: resolved / reopened | `POST /reviews/:id/resolution { status: "resolved" | "reopened", note? }` |

`myVote` comes back on review lists when signed in.

### 4.4 Suggest a business (journey 9.3)

Search first. Then `POST /business-submissions`:

```json
{ "name": "Mama Put Kitchen", "category": "food-restaurants", "state": "lagos", "city": "Lagos", "area": "Yaba",
  "identifiers": [{ "type": "instagram", "value": "@mamaputkitchen" }], "isOwner": false }
```

`isOwner: true` + `ownerRole` for owners submitting their own business. Nothing is public until staff approve.
Response includes `possibleMatches` (listings that look similar) — show "Is it one of these?".
Status list: `GET /users/me/business-submissions`.

Identifier types: `instagram`, `tiktok`, `facebook`, `x`, `whatsapp`, `website`, `phone`, `email`,
`alternative_name`, `cac_number`, `other`.

### 4.5 Claim a business (journey 9.4)

`POST /businesses/:businessId/claims { method, claimantRole, verificationTarget?, message? }`

| method | `verificationTarget` | What the user does next |
|---|---|---|
| `business_email` | email on the business website domain, or its listed public email | Enter the 6-digit code: `POST /claims/:id/verify-email { code }` (`POST /claims/:id/resend-code`) |
| `website_domain` | listed website domain | Add the TXT record from `instructions.dnsRecord`, then `POST /claims/:id/check-domain` |
| `social_account` | listed handle, e.g. `@kemis_closet` | Put `instructions.code` in the account bio; staff check it |
| `documents` | — | Upload to folder `claim-documents`, then `POST /claims/:id/documents { label, url }` |
| `manual_review` | — | `message` required; staff contact them |

Show `data.instructions.summary` after creating. `GET /users/me/claims` / `GET /claims/:id` for status,
`DELETE /claims/:id` to cancel. Staff approve every claim; approval adds the business to `GET /users/me/businesses`.

### 4.6 Business portal (owners)

Every route is `/manage/businesses/:businessId/...` and returns `403` unless the user manages that business.

| UI | Call |
|---|---|
| "My businesses" switcher | `GET /users/me/businesses` |
| Dashboard | `GET /manage/businesses/:id/dashboard` → `overview` (rating, distribution, dimensions), `responseActivity`, `unresolvedComplaints`, `trends.monthly` (6 months), `reportedIssues`, `recentReviews`, `shareLinks` |
| Edit profile | `GET` / `PATCH /manage/businesses/:id` (description, logoUrl, website, publicEmail, publicPhone, locations). Name/category are staff-only (`lockedFields`) |
| Public links | `POST /manage/businesses/:id/identifiers { type, value }`, `DELETE .../identifiers/:identifierId` |
| Reviews inbox | `GET /manage/businesses/:id/reviews?filter=all|unanswered|complaints|unresolved` (`canRespond`, `canEditResponse`, `hasOpenDispute`) |
| Respond | `POST /manage/businesses/:id/reviews/:reviewId/response { body }`; edit with `PATCH` (max 3 edits) |
| Propose resolution | `POST /manage/businesses/:id/reviews/:reviewId/resolution { note }` |
| Dispute a review | `POST /manage/businesses/:id/reviews/:reviewId/disputes { reason, details }` (details ≥ 30 chars) |
| Reports & disputes status | `GET /manage/businesses/:id/issues` |
| Share | `GET /manage/businesses/:id/share-links` → `profileUrl`, `reviewUrl`, `suggestedMessage`, `whatsappShareUrl`, `policy` |

Share/invite UI must stay neutral (PRD §7.11): show `policy` text, never "leave us 5 stars".
`reviewUrl` is `FRONTEND_URL/businesses/:slug/review` — the frontend should route it to the write-review screen.

### 4.7 Account

| UI | Call |
|---|---|
| Profile | `GET /users/me`, `PATCH /users/me { displayName?, bio?, avatarUrl?, location? }` |
| Verify email | `POST /auth/verify-email/send-code`, `POST /auth/verify-email/confirm { otp }` |
| Password | `POST /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Download my data | `GET /users/me/export` |
| Delete account | `DELETE /users/me { password }` |

Show `location` publicly only if set; never ask for a home address.

### 4.8 Staff console (only if `user.isStaff`)

Show each section only when `user.permissions` includes the permission.

| Section | Permission | Calls |
|---|---|---|
| Overview & queues | any staff | `GET /admin/dashboard` |
| Users | `USERS_VIEW` / `USERS_RESTRICT` / `STAFF_MANAGE` | `GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/users/:id/suspension`, `GET /admin/roles`, `PATCH /admin/users/:id/staff-role` |
| Listings | `BUSINESSES_MANAGE` (+ `BUSINESSES_MERGE`) | `GET/POST /admin/businesses`, `GET/PATCH /admin/businesses/:id`, `/status`, `/investigation`, `/identifiers`, `/duplicates`, `GET /admin/businesses/duplicates`, `POST /admin/businesses/:id/merge` |
| Submissions | `SUBMISSIONS_REVIEW` | `GET /admin/submissions`, `GET /admin/submissions/:id`, `POST .../approve|reject|merge` |
| Claims | `CLAIMS_REVIEW` (+ `CLAIM_DOCUMENTS_VIEW` for files) | `GET /admin/claims`, `GET /admin/claims/:id`, `POST .../approve|reject`, `PATCH /admin/businesses/:id/ownership` |
| Review moderation | `REVIEWS_MODERATE` (+ `EVIDENCE_REVIEW`) | `GET /admin/reviews?queue=pending_moderation|under_investigation|reported|evidence|removed`, `GET /admin/reviews/:id`, `POST /admin/reviews/:id/moderation`, `PATCH /admin/evidence/:id`, `POST /admin/responses/:id/remove` |
| Reports | `REPORTS_MANAGE` | `GET /admin/reports`, `PATCH /admin/reports/:id` |
| Disputes | `DISPUTES_MANAGE` | `GET /admin/disputes`, `GET/PATCH /admin/disputes/:id` |
| Categories & dimensions | `TAXONOMY_MANAGE` | `GET /admin/taxonomy`, `POST/PATCH /admin/categories`, `POST/PATCH /admin/dimensions` |
| Audit log | `AUDIT_VIEW` | `GET /admin/audit-logs?action=&targetType=&targetId=` |

Every moderation decision needs a policy `reason` (`spam`, `fabricated_review`, `harassment`, `threats`,
`hate_speech`, `impersonation`, `personal_information`, `manipulated_ratings`, `fake_evidence`,
`conflict_of_interest`, `defamatory_or_unlawful`, `no_violation`, `other`). Removal cannot use `no_violation`.

---

## 5. Uploads (Cloudinary, direct from the browser)

1. `POST /uploads/signature { folder }` → `{ uploadUrl, apiKey, signature, params, maxBytes, allowedFormats }`.
2. `POST` multipart to `uploadUrl` with the file plus `api_key`, `signature` and **every key in `params`**.
   This request goes to Cloudinary: **no `credentials: 'include'`**.
3. Send the returned `secure_url` to the API.

| folder | visibility | used by |
|---|---|---|
| `evidence` | public | review photos (`kind: photo`) |
| `evidence-private` | private | `receipt`, `screenshot`, `document` evidence |
| `logos` | public | `logoUrl` on a business |
| `avatars` | public | `avatarUrl` on a user |
| `claim-documents` | private | claim documents |

Max 5 MB, jpg/jpeg/png/webp. Private files are never returned to the browser after upload. If uploads return
`503`, Cloudinary isn't configured yet — hide upload UI; text reviews work.

---

## 6. Demo accounts (seeded)

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@revyu.ng` | `admin123` |
| Moderator | `moderator@example.com` | `demo1234` |
| Consumer | `chinedu.okafor@gmail.com` | `demo1234` |
| Business owner (Kemi's Closet, ownership verified) | `owner@example.com` | `demo1234` |
| Consumers | `reviewer1@example.com` … `reviewer6@example.com` | `demo1234` |

18 fictional demo businesses across the 6 categories. Examples: `kemi-s-closet` (6 reviews, rated, owned, has a
response), `gadget-hub-ikeja` (5 reviews, mixed), `adire-lane` (2 reviews → insufficient data),
`threadline-menswear` (no reviews).

---

## 7. Types

Generate TypeScript types from the live spec:

```bash
npx openapi-typescript https://revyu-backend.onrender.com/docs/openapi.json -o src/lib/api-schema.ts
```

Related: [FRONTEND-AUTH.md](./FRONTEND-AUTH.md) · [API-CHANGELOG-v2.md](./API-CHANGELOG-v2.md)
