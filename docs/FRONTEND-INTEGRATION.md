# TalkGround — Frontend Integration Guide (API 2.5)

**Audience:** frontend developers · **Last updated:** 21 November 2026 · **Matches:** PRD v2.5 (final MVP spec)
**Base URL:** staging `https://<staging-api-host>/api/v1` (sent to you privately) · local `http://localhost:3001/api/v1`
**Swagger:** `https://<staging-api-host>/docs` — every request **and response** schema, with examples

Read first: [FRONTEND-AUTH.md](./FRONTEND-AUTH.md). Sessions are HttpOnly cookies: send every browser request
with `credentials: 'include'`. There are no tokens and no `Authorization` header. Access cookies last 15 minutes;
the auth guide's API client refreshes them automatically.

> Test accounts for staging are shared privately. They are never written in docs or in Swagger (PRD §15).

---

## 1. What changed from API 2.0

| Area | 2.0 | 2.5 |
|---|---|---|
| Public URLs | not specified | **`/b/{slug}`**, **`/c/{category}`**, **`/c/{category}/{city}`**, server-rendered (§3) |
| Locations | free-text state/city, `GET /locations` | **City records**: `GET /cities`; a business has `location: { city, area, onlineOnly, label }`; filter `?city=lagos` |
| Category slugs | `food-restaurants` … | `food-and-restaurants`, `fashion-and-clothing`, `beauty-skincare-and-hair`, `electronics-and-gadgets`, `logistics-and-delivery`, `general-consumer-services` |
| Rating dimensions | 5 generic | Per category (e.g. food: Food quality, Hygiene and safety, Service, Delivery, Value for money). Always read them from `GET /categories/:slug` |
| Minimum reviews for a star rating | 5 | **3** (`GET /meta/config`); message is exactly **"Not enough reviews yet"** |
| Review body | `{ rating dims as { key, score } }` | `dimensions: [{ key, value }]`, **`title` required (3–120)**, body **≥ 50** chars, optional `recommend` |
| Repeat review | `newExperience: true` after 90 days | **One active review per business.** A repeat experience = `PATCH` the existing review |
| Delete review | `DELETE` = withdraw | `DELETE` = soft delete (hidden, kept for moderation) |
| Labels | `labels[]` only | Separate fields: `reviewer.emailVerified`, `evidenceAttached`, `evidenceStatus`, `underInvestigation`; ownership `ownershipVerified` (plus a ready `labels[]` for display) |
| Votes | `PUT /vote {helpful}` / `DELETE` | **`POST /reviews/:id/helpful`** toggles; `helpfulByMe` |
| Report reasons | 7 codes | `fake_or_never_visited`, `spam_or_promotional`, `personal_info`, `harassment_or_abuse`, `conflict_of_interest`, `paid_or_incentivised`, `impersonation`, `other` — field **`reasonCode`** + `note` |
| Business responses | "Official response from X" | **"Response from X"**; edits unlimited and versioned; responses can be reported |
| Ownership badge | `ownership.status` = unclaimed / claimed / ownership_verified | `ownership.status` = unclaimed / claimed **+ `ownership.ownershipVerified`** |
| Disputes | reason enum + details | **written `reason`** (≥ 30 chars); flags the review "under investigation" |
| Owner area | `/manage/businesses/:id/*` | same paths; dashboard field names changed (§5.6) |
| Evidence | photo / receipt / screenshot / document | **photo** (public, folder `evidence`) / **receipt** (private, folder `receipts`) |
| Errors | `{ code, message }` | + **`details`** when useful (e.g. `details.reviewId`, `details.duplicateCandidates`) |
| Duplicates on suggest | 409 "already listed" | **201** + `possibleMatches` ("Is it one of these?") — duplicates are signals for staff, never rejections |

---

## 2. Conventions

- Success: `{ "data": ... }`; lists add `"meta": { page, limit, total, totalPages }` (`?page=1&limit=20`, max 50).
- Error: `{ "error": { "code", "message", "details"? } }`. `message` is written for users — show it.
- Enum values in responses are **lowercase** (`"published"`, `"business_email"`); requests accept any case.
- Unknown request fields are rejected with `400`. Send only documented fields.
- Text is plain text. Render it as text, never as HTML.
- `GET /meta/config` gives the limits the UI should mirror (minimum reviews, body length, cache time…).

| Status | Meaning | Do |
|---|---|---|
| 400 | Invalid input / rule broken | Show `error.message` |
| 401 | Not signed in / session expired | Refresh once (auth guide), then login |
| 403 | Not allowed (permission, membership, unverified email, cross-site origin) | Show message |
| 404 | Not found or not public | 404 page |
| 409 | Conflict (already reviewed, duplicate claim/report/dispute, possible duplicate listing) | Use `error.details` |
| 410 | Business archived | 410 page (see §3) |
| 429 | Rate limited / login locked | Show message, retry later |
| 503 | Uploads not configured | Hide upload UI |

---

## 3. Public pages: server rendering, URLs and SEO (PRD §7.13)

**Required by the PRD:** home, category, category-in-city and business pages are **server-rendered** (Next.js server
components or equivalent). Their full content — name, description, rating, reviews, responses — must be in the HTML
with JavaScript disabled. Fetch public endpoints **from the server without cookies**. Only user-specific bits
(`helpfulByMe`, "write a review" state, dashboard links) load client-side after the page.

### 3.1 URL scheme

| Page | URL | Data |
|---|---|---|
| Business | `/b/{slug}` | `GET /businesses/{slug}` (+ `GET /businesses/{slug}/reviews?page=` for more reviews) |
| Category | `/c/{category}` | `GET /categories/{category}/businesses?page=` |
| Category in a city | `/c/{category}/{city}` | `GET /categories/{category}/businesses?city={city}&page=` |
| Write review (neutral invite link) | `/b/{slug}/review` | business profile + `GET /categories/{category}` |

### 3.2 Business page: handle every response kind

`GET /businesses/{slug}` returns `data.kind`:

| `data.kind` / status | Do |
|---|---|
| `"profile"` | Render the page. Use `data.seo` for the head (below). |
| `"redirect"` | Send **HTTP 301** to `data.location` (old slug after a rename, or a merged listing). |
| `"suspended"` | Render a short notice page with `<meta name="robots" content="noindex,follow">`. |
| HTTP `410` | Archived: return 410 (or 404). |
| HTTP `404` | Not public (suggested, pending, rejected) or unknown. |

### 3.3 `data.seo` → `<head>`

```tsx
// app/b/[slug]/page.tsx (Next.js App Router)
export async function generateMetadata({ params }) {
  const { data } = await getBusiness(params.slug); // server fetch, no cookies
  if (data.kind !== 'profile') return {};
  const s = data.seo;
  return {
    title: s.title,
    description: s.description,
    alternates: { canonical: s.canonicalUrl },
    robots: s.robots,                       // "index,follow" or "noindex,follow"
    openGraph: { ...s.openGraph, images: s.openGraph.image ? [s.openGraph.image] : [] },
    twitter: { card: 'summary', title: s.openGraph.title, description: s.description },
  };
}
// In the page body:
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data.seo.jsonLd) }} />
```

Rules the backend already enforces in `data.seo` — do not override them:
- `robots` follows the PRD indexable rule (published, description ≥ 80 chars, a city or "online only", at least one
  identifier, not force-noindexed by a moderator). Claim and verification status never affect it.
- `jsonLd.aggregateRating` is present **only** when a star rating is displayed, with the same numbers as the page.
  Review markup covers only published reviews shown on the page. Don't add markup the visitor can't see.
- Titles and descriptions never say "verified" or "trusted". Keep `data.disclaimer` visible on the page:
  *"A public listing does not mean TalkGround endorses or has verified this business."*
- With zero reviews, the page must say there are no reviews yet (`rating.reviewCount === 0`) and show no stars.

Category pages: `data.seo` from `/categories/{category}/businesses` (indexable only with ≥ 5 published businesses).

### 3.4 Sitemap and robots.txt

- `GET /seo/sitemap` → `[{ type, path, url, lastModified }]` — **only indexable URLs**. Render it as `/sitemap.xml`.
- `robots.txt` must reference the sitemap and **block** the API, admin, dashboard and account paths, for example:

```
User-agent: *
Disallow: /api/
Disallow: /admin
Disallow: /dashboard
Disallow: /account
Sitemap: https://<site>/sitemap.xml
```

- **Staging must not be indexed**: serve `Disallow: /` (and `X-Robots-Tag: noindex`) on every non-production host.

### 3.5 Freshness (removed content must disappear within 15 minutes)

- Public API responses carry `Cache-Control: s-maxage=900` (PUBLIC_CACHE_MAX_MINUTES). Use ISR/`revalidate` ≤ 900 s.
- **On-demand revalidation (preferred):** give the backend team a revalidation endpoint. The API will
  `POST FRONTEND_REVALIDATE_URL` with `{ "paths": ["/b/slug", "/c/category", ...] }` and header
  `X-TalkGround-Signature: sha256=<HMAC-SHA256 of the raw body with REVALIDATE_SECRET>`. Verify the signature, then
  call `revalidatePath` for each path. It fires when reviews, responses, listings or accounts change.

---

## 4. Concepts the UI must get exactly right

### 4.1 Categories and dimensions
Build the review form from `GET /categories/{slug}` → `ratingDimensions[]` (`key`, `label`, `description`,
`required`, `order`). Required → must be rated; optional → offer "Not applicable". Overall rating is always required.
Hotels and accommodation exists but is inactive (not a launch category) and is not returned.

### 4.2 Ratings (PRD §7.12)

```json
"rating": {
  "reviewCount": 2, "average": null, "sufficientData": false,
  "message": "Not enough reviews yet", "minimumReviews": 3,
  "distribution": [{ "stars": 5, "count": 1, "percent": 50 }, …],
  "dimensions": [{ "key": "delivery", "label": "Delivery", "reviewCount": 2, "average": null, "sufficientData": false }]
}
```

- Always show `reviewCount` next to any rating. When `average` is `null`, show `message` instead of stars.
- Always show the 1–5 distribution counts. Never compute your own average.
- No leaderboards or "top rated" lists (PRD: no public rankings). A user-chosen `sort=rating` on search is fine.
- Link "How ratings work" to `GET /meta/rating-methodology`.

### 4.3 The five labels are separate facts (PRD §6.4)

| Show | Field | Meaning (use this wording) |
|---|---|---|
| Account verified | `review.reviewer.emailVerified` | The reviewer's email is verified. **Not** proof of purchase. |
| Evidence attached | `review.evidenceAttached` (and `evidenceStatus` ≠ `accepted`) | Uploaded, not yet looked at by staff. |
| Evidence reviewed | `review.evidenceStatus === 'accepted'` | A moderator examined the evidence. |
| Under investigation | `review.underInvestigation` | The review has an open report or dispute. It stays visible. |
| Ownership verified | `business.ownership.ownershipVerified` | Staff confirmed the claimant controls the profile. Not an endorsement. |

`review.labels[]` already contains `{ key, label, description }` for the first four in display order — use them,
or build from the fields; never merge them into one "verified" badge, and never write "verified purchase".

### 4.4 Ownership
`ownership = { status: 'unclaimed' | 'claimed', ownershipVerified, label, description }`. A pending claim is shown
as unclaimed. Show `description` in a tooltip.

### 4.5 Responses and resolution
- `review.response` → `{ body, label: "Response from <business>", representative: { displayName }, createdAt, edited }`.
  Show it beside the review.
- `review.resolution = { status, label }`: `none`, `business_responded`, `resolution_proposed`,
  `resolved_by_consumer`, `reopened`. Only the reviewer can mark `resolved`/`reopened`. Never affects the rating.
- `GET /reviews/{id}` adds `resolutionHistory[]`.

---

## 5. Screens → endpoints

### 5.1 Discover (no account)

| UI | Call |
|---|---|
| Search | `GET /businesses?q=&category=&city=&minRating=&sort=relevance|most_reviewed|rating&page=` |
| Category chips | `GET /categories` |
| City filter | `GET /cities` |
| Business page | §3 |
| Reviewer profile | `GET /users/{username}` |

`q` matches name, alternative names, `@handles`, website domain, category, city and area (partial words), and a
**phone number exactly** (any format: `0803 123 4567`, `+234…`). Searching `@mamaput_lagos` returns the business.

### 5.2 Write / update a review (signed in, verified email)

```json
POST /reviews
{
  "businessId": "uuid",
  "overallRating": 4,
  "dimensions": [{ "key": "food_quality", "value": 5 }, { "key": "value_for_money", "value": 4 }],
  "title": "Great food, slow delivery",
  "body": "At least 50 characters describing the experience…",
  "recommend": true
}
```

- `data.moderation` is a message when the review is held for a quick check (status `pending`, visible only to the
  author). Otherwise the review is live.
- Already reviewed → `409` with `error.details.reviewId` → open the edit form: `PATCH /reviews/{id}` (a repeat
  experience is an update; history is kept; the page shows "Edited" + `editedAt`).
- `DELETE /reviews/{id}` deletes (soft). `GET /users/me/reviews` lists every status.
- Max 3 new reviews / 24 h. Business members cannot review their own business.

### 5.3 Interactions

| Action | Call |
|---|---|
| Helpful toggle | `POST /reviews/{id}/helpful` → `{ helpful, helpfulCount }` |
| Report review | `POST /reviews/{id}/reports { reasonCode, note? }` |
| Report a business response | `POST /reviews/{id}/response/reports { reasonCode, note? }` |
| Reviewer: resolved / reopened | `POST /reviews/{id}/resolution { status: "resolved" | "reopened", note? }` |
| Evidence | upload (§6) then `POST /reviews/{id}/evidence { type: "photo" | "receipt", url }`; remove `DELETE /reviews/{id}/evidence/{evidenceId}` |

### 5.4 Suggest a business

`POST /business-submissions { name, category, city | onlineOnly, area?, description?, website?, identifiers?, isOwner?, ownerRole? }`
→ `201` with `possibleMatches[]` — show "Is it one of these?" with links. Staff approve, reject or merge.
Status: `GET /users/me/business-submissions` (`adminNote` holds the reason after a decision).

Identifier types: `instagram`, `tiktok`, `facebook`, `x`, `website`, `phone`, `email`, `alt_name`, `other`.

### 5.5 Claim a business

`POST /businesses/{id}/claims { method, claimantRole, verificationTarget?, message? }`

| method | `verificationTarget` | Next step |
|---|---|---|
| `social_account` | listed handle, e.g. `@mamaput_lagos` | Put `data.instructions.code` in the bio; staff check it. **Use this for Instagram-only vendors.** |
| `business_email` | email on the website domain, or the listed email | `POST /claims/{id}/verify-email { code }` (`/resend-code`) |
| `website_domain` | listed domain | Add `instructions.dnsRecord`, then `POST /claims/{id}/check-domain` |
| `documents` | — | Upload to folder `claim-documents`, then `POST /claims/{id}/documents { label, url }` |
| `manual_review` | — | `message` required |

Show `data.instructions.summary`. Status: `GET /users/me/claims`, `GET /claims/{id}` (`decisionReason` on
rejection). On approval the business appears in `GET /users/me/businesses`.

### 5.6 Business dashboard (members only) — `/manage/businesses/{businessId}/…`

| UI | Call |
|---|---|
| Business switcher | `GET /users/me/businesses` |
| Overview | `GET …/dashboard` → `rating` (+ distribution, dimensions), `publishedReviewCount`, `responseActivity { responded, unanswered, responseRate, averageResponseHours }`, `unresolvedComplaints`, `trend[]` (6 months), `issues`, `recentReviews`, `shareLinks` |
| Edit profile | `GET` / `PATCH …` (description, logoUrl, website, publicEmail, publicPhone, city, area, onlineOnly). `indexingChecklist` says what blocks search indexing. Name/category are staff-only. |
| Public links | `POST …/identifiers { type, value }` → `alsoUsedBy` (other listings sharing it); `DELETE …/identifiers/{id}` |
| Reviews inbox | `GET …/reviews?filter=all|unanswered|complaints|unresolved` (`canRespond`, `canEditResponse`, `canDispute`, `disputeStatus`) |
| Respond / edit | `POST` / `PATCH …/reviews/{reviewId}/response { body }` |
| Propose resolution | `POST …/reviews/{reviewId}/resolution { note }` |
| Dispute | `POST …/reviews/{reviewId}/disputes { reason }` |
| Report a review | `POST /reviews/{reviewId}/reports` (members can report) |
| Reports & disputes | `GET …/issues` |
| Share | `GET …/share-links` → `profileUrl`, `reviewUrl`, `suggestedMessage`, `whatsappShareUrl`, `badge { text, url, html }`, `policy` |

Keep the dashboard simple (no decorative charts). Share/invite wording must stay neutral: show `policy`.

### 5.7 Account

| UI | Call |
|---|---|
| Profile | `GET` / `PATCH /users/me { displayName?, bio?, avatarUrl?, location? }` |
| Email verification | `POST /auth/verify-email/send-code`, `POST /auth/verify-email/confirm { otp }` |
| Passwords | `POST /auth/change-password`, `/auth/forgot-password`, `/auth/reset-password` |
| Data export / delete | `GET /users/me/export`, `DELETE /users/me { password }` |

Phone verification is off by default (`requirePhoneVerifiedForReviews` in `/meta/config`).

### 5.8 Staff console (only when `user.isStaff`)

Permissions are PRD §9 keys in `user.permissions`. Show a section only when the permission is present.

| Section | Permission | Calls |
|---|---|---|
| Overview & queues | any staff | `GET /admin/dashboard` |
| Review moderation | `review.moderate` | `GET /admin/reviews?queue=pending|under_investigation|reported|evidence|suspended|removed`, `GET /admin/reviews/{id}`, `POST /admin/reviews/{id}/moderation { action, reason, note }`, `PATCH /admin/reviews/{id}/content`, `POST /admin/responses/{id}/remove`, `PATCH /admin/businesses/{id}/noindex` |
| Evidence | `evidence.review` | `PATCH /admin/reviews/{id}/evidence-status { status: accepted|rejected, reason }` |
| Reports | `report.resolve` | `GET /admin/reports`, `PATCH /admin/reports/{id} { decision: dismiss|suspend|remove|investigate, reason }` |
| Suggestions | `suggestion.resolve` | `GET /admin/submissions`, `GET /admin/submissions/{id}`, `POST …/approve|reject|merge` |
| Claims | `claim.decide` | `GET /admin/claims`, `GET /admin/claims/{id}`, `POST …/approve { ownershipVerified, reason }`, `POST …/reject { reason }`, `PATCH /admin/businesses/{id}/ownership` |
| Listings | `business.create` / `business.edit` / `business.suspend` / `business.merge` | `POST /admin/businesses`, `GET/PATCH /admin/businesses/{id}`, `PATCH …/status` (shows `allowedTransitions`), identifiers, `GET /admin/businesses/duplicates`, `POST …/merge` |
| Disputes | `dispute.decide` | `GET /admin/disputes`, `GET /admin/disputes/{id}`, `POST …/start-review`, `PATCH /admin/disputes/{id} { decision: upheld|review_actioned|closed, reviewAction?, reason, note }` |
| Users | `user.suspend` | `GET /admin/users`, `GET /admin/users/{id}`, `PATCH …/suspension`, `GET /admin/emails`, `POST /admin/emails/{id}/retry` |
| Categories, dimensions, cities | `category.manage` | `GET /admin/taxonomy`, `POST/PATCH /admin/categories`, `/admin/dimensions`, `/admin/cities` |
| Roles & audit | `role.assign`, `auditlog.export` | `GET /admin/roles`, `PATCH /admin/users/{id}/staff-role { roleKey, reason }`, `GET /admin/audit-logs`, `GET /admin/audit-logs/export` (CSV) |

Moderation decisions need a policy `reason` (`spam`, `fabricated_review`, `harassment`, `threats`, `hate_speech`,
`impersonation`, `personal_information`, `rating_manipulation`, `fake_evidence`, `conflict_of_interest`,
`defamatory_content`, `legal_complaint`, `no_violation`, `other`). Suspending/removing cannot use `no_violation`.
Dispute decision `upheld` means **the review stays**.

---

## 6. Uploads (Cloudinary, browser → Cloudinary directly)

1. `POST /uploads/signature { folder }` → `{ uploadUrl, apiKey, signature, params, maxBytes, allowedFormats }`.
2. `POST` multipart to `uploadUrl` with the file, `api_key`, `signature` and **every key in `params`** —
   no `credentials: 'include'` on this request (it goes to Cloudinary).
3. Send `secure_url` to the API.

| folder | visibility | for |
|---|---|---|
| `evidence` | public | review photos |
| `receipts` | private | review receipts (never shown publicly) |
| `logos` | public | business logo |
| `avatars` | public | user avatar |
| `claim-documents` | private | claim evidence |

Max 5 MB; jpg, jpeg, png, webp. `503` = uploads not configured yet → hide the upload UI.

---

## 7. Launch checklist owned by the frontend (PRD §19)

- [ ] Public business, category and city pages render their full content with JavaScript disabled
- [ ] `/b/{slug}` pages; `redirect` kind → 301; `suspended` → noindex notice; 410 for archived
- [ ] `<head>` from `data.seo` (title, description, canonical, robots, Open Graph, Twitter) — WhatsApp preview checked
- [ ] JSON-LD from `data.seo.jsonLd` embedded as-is
- [ ] `/sitemap.xml` from `GET /seo/sitemap`; `robots.txt` blocks `/api`, `/admin`, `/dashboard`, `/account`
- [ ] Staging blocks all indexing
- [ ] Revalidation ≤ 15 minutes (or the on-demand webhook)
- [ ] Every browser call uses `credentials: 'include'`; no tokens stored
- [ ] Single canonical host, HTTP → HTTPS; one registrable domain shared with the API; tested on Safari and iPhone
- [ ] Privacy policy, terms and moderation policy pages published
- [ ] Labels shown as separate facts; no "verified purchase" wording anywhere

---

## 8. Types

```bash
npx openapi-typescript https://<staging-api-host>/docs/openapi.json -o src/lib/api-schema.ts
```

Related: [FRONTEND-AUTH.md](./FRONTEND-AUTH.md) · [API-CHANGELOG-v2.5.md](./API-CHANGELOG-v2.5.md)
