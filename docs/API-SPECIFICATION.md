# Revyu — API Specification v1.0

**Base URL:** `http://localhost:3001/api/v1` (dev)  
**Auth:** JWT access token in `Authorization: Bearer <token>` header  
**Content-Type:** `application/json` unless noted

---

## Conventions

| Pattern | Description |
|---|---|
| Success | `{ "data": T }` or `{ "data": T, "meta": { pagination } }` |
| Error | `{ "error": { "code": string, "message": string, "details?": object } }` |
| Pagination | `?page=1&limit=20` → `meta: { page, limit, total, totalPages }` |
| Slug | URL-safe lowercase hyphenated strings |

### HTTP Status Codes

| Code | Usage |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Validation error |
| 401 | Unauthenticated |
| 403 | Forbidden (role/ownership) |
| 404 | Not found |
| 409 | Conflict (duplicate review, email taken) |
| 429 | Rate limited |

---

## Auth

### POST `/auth/register`

Create account. Sends email verification.

**Body:**
```json
{
  "email": "ada@example.com",
  "password": "securePass123",
  "displayName": "Ada O.",
  "username": "ada_o",
  "phone": "+2348012345678"
}
```

**Response 201:**
```json
{
  "data": {
    "user": { "id": "uuid", "email": "ada@example.com", "username": "ada_o", "displayName": "Ada O." },
    "message": "Verification email sent"
  }
}
```

### POST `/auth/login`

**Body:** `{ "email": string, "password": string }`

**Response 200:**
```json
{
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "user": { "id": "uuid", "email": "...", "username": "...", "displayName": "...", "role": "user" }
  }
}
```

### POST `/auth/refresh`

**Body:** `{ "refreshToken": string }`

### POST `/auth/forgot-password`

**Body:** `{ "email": string }`

### POST `/auth/reset-password`

**Body:** `{ "token": string, "password": string }`

### POST `/auth/verify-email`

**Body:** `{ "token": string }`

### POST `/auth/verify-phone/send-otp`

Requires auth. Sends SMS OTP via Termii.

### POST `/auth/verify-phone/confirm-otp`

**Body:** `{ "otp": string }`

---

## Home / Landing (Public)

### GET `/home`

Landing page feed: hero copy, category/city chips, featured reviews.

**Query:** `q`, `category` (restaurants|hotels), `city` (lagos|abuja), `limit` (trusted cards, max 20), `sectorLimit` (sector grid, max 12, default 4)

**Response:**
```json
{
  "data": {
    "hero": { "title": "...", "subtitle": "..." },
    "categories": [{ "id": "restaurants", "label": "Dining", "value": "restaurants" }],
    "cities": [{ "id": "lagos", "label": "Lagos", "value": "lagos" }],
    "stats": { "totalBrands": 4 },
    "trustedBrandCards": [
      {
        "id": "uuid",
        "rating": 4,
        "title": "...",
        "excerpt": "...",
        "helpfulCount": 12,
        "relativeDate": "1 week ago",
        "author": { "displayName": "...", "username": "...", "avatarUrl": null },
        "brand": { "name": "...", "slug": "...", "logoUrl": "...", "categoryLabel": "Dining", "city": "lagos" }
      }
    ],
    "featuredReviews": "same as trustedBrandCards (deprecated alias)",
    "sectorBrands": [
      {
        "id": "uuid",
        "name": "...",
        "slug": "...",
        "logoUrl": "...",
        "averageRating": 4.5,
        "reviewCount": 24,
        "category": "restaurants",
        "categoryLabel": "Dining",
        "area": "VI",
        "location": "VI, Lagos, Nigeria",
        "trustScore": 82,
        "trustLabel": "Very Good"
      }
    ],
    "topRatedThisWeek": [
      {
        "rank": 1,
        "name": "...",
        "slug": "...",
        "logoUrl": "...",
        "area": "...",
        "averageRating": 4.8,
        "averageRatingThisWeek": 4.8,
        "reviewsThisWeek": 6,
        "reviewCount": 24,
        "location": "..."
      }
    ]
  }
}
```

**Ranking:** `topRatedThisWeek` uses highest average rating from reviews in the last 7 days (tie-break: review count). If fewer than 5 brands have week activity, backfills from all-time highest rated.

---

## Brands (Public)

### GET `/brands/filters`

Filter metadata for explore sidebar (categories, cities, rating tiers, sort options). Includes live **counts** from the database.

### GET `/brands`

List brands with search, filter, sort.

**Query:** `q`, `city` (lagos|abuja), `category` (restaurants|hotels), `minRating`, `sort` (rating|review_count|most_reviewed|newest), `page`, `limit` (default 9)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Jenny's Glow Kitchen",
      "slug": "jennys-glow-kitchen",
      "logoUrl": "https://...",
      "category": "restaurants",
      "subType": "casual_dining",
      "city": "lagos",
      "area": "Lekki",
      "averageRating": 4.2,
      "reviewCount": 15,
      "ratingBreakdown": { "5": 8, "4": 4, "3": 2, "2": 1, "1": 0 },
      "ratingDistribution": { "5": 53, "4": 27, "3": 13, "2": 7, "1": 0 },
      "tags": ["Dining", "Jollof"],
      "claimed": true,
      "trustScore": 82,
      "trustLabel": "Very Good",
      "location": "Lekki, Lagos, Nigeria"
    }
  ],
  "meta": { "page": 1, "limit": 9, "total": 4, "totalPages": 1, "showing": 4, "query": "All Brands" }
}
```

### GET `/brands/:slug/context`

Requires auth. Whether the current user already reviewed this brand.

**Response:** `{ "data": { "userHasReviewed": false, "reviewId": null } }`

### GET `/brands/:slug`

Full brand detail with rating breakdown and trust score.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "name": "...",
    "slug": "...",
    "description": "...",
    "logoUrl": "...",
    "website": "...",
    "category": "restaurants",
    "categoryLabel": "Dining",
    "subType": "buka",
    "city": "lagos",
    "area": "VI",
    "averageRating": 4.2,
    "reviewCount": 15,
    "ratingBreakdown": { "5": 8, "4": 4, "3": 2, "2": 1, "1": 0 },
    "ratingDistribution": { "5": 53, "4": 27, "3": 13, "2": 7, "1": 0 },
    "tags": ["Dining"],
    "claimed": true,
    "trustScore": 82,
    "trustLabel": "Very Good"
  }
}
```

### GET `/brands/:slug/reviews`

Optional auth — if token sent, each review includes `helpfulByMe`.

**Query:** `sort` (recent|rating_high|rating_low|helpful|verified_first), `page`, `limit`

---

## Reviews

### POST `/reviews`

Requires auth. One review per user per brand. **v1:** any logged-in user (phone/email OTP not required yet).

**Body:**
```json
{
  "brandId": "uuid",
  "rating": 4,
  "title": "Great jollof, slow service",
  "body": "Visited on a Saturday evening. The jollof was excellent...",
  "pros": "Tasty food, clean space",
  "cons": "Long wait time",
  "recommend": true
}
```

### PATCH `/reviews/:id`

Owner only. Same fields as create (partial).

### DELETE `/reviews/:id`

Owner only. Soft-delete → status `removed`.

### POST `/reviews/:id/photos`

Multipart. Up to 3 photos. `type=photo`.

### POST `/reviews/:id/receipt`

Multipart. Single image. Sets status `pending_verification`.

### POST `/reviews/:id/report`

**Body:**
```json
{
  "reason": "fake_spam|never_visited|offensive|paid_incentivized|other",
  "note": "optional string"
}
```

### POST `/reviews/:id/helpful`

Requires auth. Toggle helpful vote (Yelp/Trustpilot-style). One vote per user per review.

**Response:** `{ "data": { "helpful": true, "helpfulCount": 13 } }`

### POST `/reviews/:id/view`

Public. Increment view count for dashboard analytics.

**Response:** `{ "data": { "id": "uuid", "viewCount": 43 } }`

---

## Brand Suggestions

### POST `/brand-suggestions`

Requires auth.

**Body:**
```json
{
  "name": "New Spot",
  "category": "restaurants",
  "subType": "buka",
  "city": "lagos",
  "area": "Yaba",
  "website": "https://..."
}
```

### GET `/brand-suggestions` (admin)

### PATCH `/brand-suggestions/:id` (admin)

**Body:** `{ "status": "approved|rejected", "adminNote?": string }`

On approve → creates brand.

---

## Users

### GET `/users/me`

Requires auth. Current user profile for settings page.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "email": "...",
    "displayName": "...",
    "username": "...",
    "bio": "...",
    "avatarUrl": null,
    "city": "lagos",
    "location": "Lagos, Nigeria",
    "interests": [{ "value": "restaurants", "label": "Dining" }]
  }
}
```

### PATCH `/users/me`

Requires auth. Update profile.

**Body:** `{ "displayName?", "bio?", "avatarUrl?", "city?", "interests?": ["RESTAURANTS","HOTELS"] }`

### GET `/users/me/dashboard`

Requires auth. User overview stats + recent reviews (dashboard screen).

**Stats fields:** `totalReviews`, `reviewsThisWeek`, `reviewTrendPercent`, `helpfulVotes`, `helpfulVotesThisWeek`, `totalViews`

### GET `/users/:username`

Public profile + published reviews.

### GET `/users/me/reviews`

Authenticated user's reviews (all statuses).

---

## Survey & Waitlist (Public)

### POST `/survey/responses`

**Body:**
```json
{
  "answers": { "q1": ["friends"], "q2": 5, "q12": 5, "...": "..." },
  "email": "optional@example.com",
  "city": "lagos"
}
```

### POST `/waitlist`

**Body:**
```json
{
  "fullName": "Tolu Ade",
  "email": "tolu@example.com",
  "phone": "+234...",
  "city": "lagos",
  "primaryUse": "restaurants|hotels|both|write_reviews",
  "attribution": "whatsapp",
  "consentGiven": true
}
```

### GET `/waitlist/stats` (admin)

Returns count by city and primary use.

---

## Admin

All routes require `role: admin`.

### GET `/admin/dashboard`

```json
{
  "data": {
    "brands": 120,
    "reviews": 340,
    "users": 89,
    "pendingSuggestions": 5,
    "flaggedReviews": 3,
    "pendingReceiptVerifications": 7,
    "reportedReviews": 2
  }
}
```

### Brands CRUD

| Method | Path | Action |
|---|---|---|
| GET | `/admin/brands` | List all |
| POST | `/admin/brands` | Create |
| PATCH | `/admin/brands/:id` | Update |
| DELETE | `/admin/brands/:id` | Deactivate |

**Create body:**
```json
{
  "name": "Brand Name",
  "slug": "brand-name",
  "description": "...",
  "logoUrl": "...",
  "website": "...",
  "category": "restaurants",
  "subType": "fine_dining",
  "city": "abuja",
  "area": "Garki"
}
```

### Review Moderation

| Method | Path | Action |
|---|---|---|
| GET | `/admin/reviews/queue` | Query: `queue` (reported\|flagged\|pending_receipt\|suspended) |
| PATCH | `/admin/reviews/:id` | `{ "action": "approve\|suspend\|remove\|dismiss_report", "note?": string }` |
| POST | `/admin/reviews/:id/verify-receipt` | `{ "approved": true\|false }` |

### User Management

| Method | Path | Action |
|---|---|---|
| PATCH | `/admin/users/:id/suspend` | `{ "suspended": true, "reason": string }` |

---

## Uploads

### POST `/uploads/signature`

Returns Cloudinary signed upload params for direct client upload.

**Body:** `{ "folder": "reviews|receipts|brands", "resourceType": "image" }`

---

## Enums Reference

```typescript
enum BrandCategory { RESTAURANTS = 'restaurants', HOTELS = 'hotels' }
enum RestaurantSubType { CASUAL, FAST_FOOD, FINE_DINING, BUKA }
enum HotelSubType { HOTEL, GUEST_HOUSE, SHORT_LET }
enum City { LAGOS = 'lagos', ABUJA = 'abuja' }
enum ReviewStatus { PUBLISHED, PENDING_VERIFICATION, FLAGGED, SUSPENDED, REMOVED }
enum ReportReason { FAKE_SPAM, NEVER_VISITED, OFFENSIVE, PAID_INCENTIVIZED, OTHER }
enum UserRole { USER, ADMIN }
enum PrimaryUse { RESTAURANTS, HOTELS, BOTH, WRITE_REVIEWS }
```

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| POST `/reviews` | 3 per user per 24h |
| POST `/auth/verify-phone/send-otp` | 3 per hour |
| POST `/waitlist` | 5 per IP per hour |
| POST `/survey/responses` | 10 per IP per hour |
