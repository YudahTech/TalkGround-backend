# TalkGround API — Endpoint Testing Guide

**For:** Backend developers and QA  
**Tools:** Swagger UI (`http://localhost:3001/docs`), Postman, or curl  
**Prerequisites:** Docker Postgres running, migrations applied, seed run

---

## Setup before testing

```bash
# From repo root
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev:api
```

Verify: `GET http://localhost:3001/api/v1/home` returns JSON.

### Dev mode (no third-party services)

In `apps/api/.env`:

```env
OTP_DEV_MODE=true
# Leave TERMII_* and CLOUDINARY_* empty for early testing
```

| Without Termii | Without Cloudinary |
|----------------|-------------------|
| OTP logged in API terminal | Text reviews work |
| Demo user already `phoneVerified` | Skip `POST /uploads/signature` and media |
| Use `chinedu.okafor@gmail.com` / `demo1234` | Use `avatarUrl` as null or external URL in PATCH |

---

## How to use Swagger

1. Open `http://localhost:3001/docs` (hard-refresh: Ctrl+Shift+R)
2. Expand tag **Users — Me (JWT)** for `/users/me`, `/users/me/dashboard`, `/users/me/reviews`
3. Expand other tags (Auth, Brands, Reviews, Admin…)
4. **Try it out** → Execute
5. For protected routes: login first → **Authorize** → paste `accessToken`

See also: [SWAGGER-GUIDE.md](./SWAGGER-GUIDE.md)

---

## Test accounts (seed)

| Email | Password | Role | Phone verified |
|-------|----------|------|----------------|
| `chinedu.okafor@gmail.com` | `demo1234` | USER | Yes |
| `admin@revyu.ng` | `admin123` | ADMIN | Yes |

Sample brand slug: `nexxas-kitchen`

---

## Auth

### POST `/auth/register` — Public

**Body:**
```json
{
  "email": "newuser@test.com",
  "password": "password123",
  "displayName": "New User",
  "username": "newuser_test",
  "phone": "+2348099999999"
}
```

**Expect:** `200` + `data.accessToken`, `data.user`, `data.message`  
**Errors:** `409` if email/username taken, `400` if validation fails

---

### POST `/auth/login` — Public

**Body:**
```json
{
  "email": "chinedu.okafor@gmail.com",
  "password": "demo1234"
}
```

**Expect:** `200` + `data.accessToken`, `data.user` with `id`, `role`, `phoneVerified`  
**Save** `accessToken` for later tests.

---

### POST `/auth/forgot-password` — Public

**Body:** `{ "email": "chinedu.okafor@gmail.com" }`

**Expect:** `200` + generic message (email not actually sent yet)

---

### POST `/auth/verify-phone/send-otp` — JWT

**Headers:** `Authorization: Bearer <token>`

**Expect:** `200` + `{ data: { message: "OTP sent" } }`  
**Dev:** Check API terminal for `[DEV OTP] phone=... code=......`

---

### POST `/auth/verify-phone/confirm-otp` — JWT

**Body:** `{ "otp": "123456" }` (use code from terminal in dev)

**Expect:** `200` + `data.user` with `phoneVerified: true`

---

## Home

### GET `/home` — Public

**Query (optional):** `?city=lagos&category=restaurants&limit=6&sectorLimit=4`

**Expect:** `200` + `data` with:
- `hero`, `categories`, `cities`, `stats.totalBrands`
- `trustedBrandCards` (array)
- `sectorBrands` (array)
- `topRatedThisWeek` (up to 5, with `rank`)

---

## Brands

### GET `/brands/filters` — Public

**Expect:** `200` + `data.categories[]` with `count`, `data.cities[]` with `count`, `ratingFilters`, `sortOptions`

---

### GET `/brands` — Public

**Query examples:**
- `?page=1&limit=9`
- `?q=nexxa&city=lagos&category=restaurants&sort=most_reviewed&minRating=4`

**Expect:** `200` + `data[]` (brand cards), `meta.page`, `meta.total`, `meta.showing`

Each brand: `id`, `name`, `slug`, `averageRating`, `reviewCount`, `trustScore`, `location`

---

### GET `/brands/:slug` — Public

**Example:** `/brands/nexxas-kitchen`

**Expect:** `200` + `data` with full detail, `ratingDistribution`, `ratingBreakdown`  
**404** if slug unknown or inactive

---

### GET `/brands/:slug/context` — JWT

**Example:** `/brands/nexxas-kitchen/context`

**Expect:** `200` + `{ data: { userHasReviewed: boolean, reviewId: string | null } }`  
**401** without token

---

## Reviews

### GET `/brands/:slug/reviews` — Optional JWT

**Query:** `?sort=recent&page=1&limit=20`

**Expect:** `200` + `data[]` reviews, `meta` pagination  
Each review: `rating`, `title`, `body`, `helpfulCount`, `author`, `photos`  
With JWT: `helpfulByMe` on each review

---

### POST `/reviews` — JWT (logged-in user)

**Note:** Phone/email verification is **not** required for v1. Any valid JWT can create a review.

**Body:**
```json
{
  "brandId": "<uuid from GET /brands>",
  "rating": 4,
  "title": "Great experience overall",
  "body": "Visited on a Saturday evening. The food was excellent and the service was friendly throughout our meal.",
  "pros": "Tasty food",
  "cons": "Parking",
  "recommend": true
}
```

**Expect:** `201` or `200` + `data` review object  
**Errors:**
- `403` if phone not verified
- `409` if already reviewed brand
- `400` if body < 50 chars or 3 reviews in 24h

---

### PATCH `/reviews/:id` — JWT (owner)

**Body (partial):** `{ "rating": 5, "title": "Updated title" }`

**Expect:** `200` + updated review  
**403** if not owner

---

### DELETE `/reviews/:id` — JWT (owner)

**Expect:** `200` + `{ data: { message: "Review removed" } }`

---

### POST `/reviews/:id/helpful` — JWT

**Expect:** `200` + `{ data: { helpful: true|false, helpfulCount: number } }`  
Toggle on second call.

---

### POST `/reviews/:id/view` — Public

**Expect:** `200` + `{ data: { id, viewCount } }` — count increments

---

### POST `/reviews/:id/media` — JWT

**Body:** `{ "url": "https://example.com/photo.jpg", "type": "photo" }`

**Expect:** `200` + media object  
**400** if > 3 photos

---

### POST `/reviews/:id/report` — JWT

**Body:** `{ "reason": "FAKE_SPAM", "note": "optional" }`

**Expect:** `200` + report object

---

## Users

### GET `/users/me` — JWT

**Expect:** `200` + profile: `email`, `displayName`, `bio`, `city`, `interests`

---

### PATCH `/users/me` — JWT

**Body:** `{ "bio": "Updated bio", "city": "lagos" }`

**Expect:** `200` + updated profile

---

### GET `/users/me/dashboard` — JWT

**Expect:** `200` + `data.stats` (`totalReviews`, `reviewsThisWeek`, `helpfulVotes`, `helpfulVotesThisWeek`, `totalViews`) + `data.recentReviews`

---

### GET `/users/me/reviews` — JWT

**Expect:** `200` + array of user's reviews

---

### GET `/users/:username` — Public

**Example:** `/users/chinedu_okafor`

**Expect:** `200` + public profile + reviews (no email)

---

## Uploads

### POST `/uploads/signature` — JWT

**Body:** `{ "folder": "reviews" }`

**With Cloudinary configured:** `200` + `data.cloudName`, `signature`, `timestamp`, `folder`  
**Without Cloudinary:** `503` Service Unavailable

---

## Growth

### POST `/survey/responses` — Public

**Body:** `{ "answers": { "q1": "friends" }, "email": "test@test.com" }`

**Expect:** `200` + thank you message

---

### POST `/waitlist` — Public

**Body:**
```json
{
  "fullName": "Test User",
  "email": "waitlist@test.com",
  "city": "lagos",
  "primaryUse": "restaurants",
  "consentGiven": true
}
```

**Expect:** `200` + confirmation  
**409** if email already on waitlist

---

### GET `/waitlist/stats` — Admin JWT

Login as `admin@revyu.ng`

**Expect:** `200` + `{ data: { total, byCity: { lagos, abuja } } }`  
**403** as regular user

---

## Admin (all require admin JWT)

| Method | Path | Expect |
|--------|------|--------|
| GET | `/admin/dashboard` | Counts: brands, reviews, users, queues |
| GET | `/admin/brands` | All brands |
| POST | `/admin/brands` | Create brand |
| PATCH | `/admin/brands/:id` | Update brand |
| DELETE | `/admin/brands/:id` | Deactivate (INACTIVE) |
| GET | `/admin/reviews/queue?queue=flagged` | Moderation list |
| PATCH | `/admin/reviews/:id` | `{ "action": "approve" }` |
| GET | `/admin/suggestions` | Pending brand suggestions |
| PATCH | `/admin/suggestions/:id` | `{ "status": "approved" }` |
| PATCH | `/admin/users/:id/suspend` | `{ "suspended": true, "reason": "..." }` |

---

## POST `/brand-suggestions` — JWT

**Body:**
```json
{
  "name": "New Restaurant",
  "category": "restaurants",
  "city": "lagos",
  "area": "Yaba"
}
```

**Expect:** `200` + suggestion object

---

## Suggested test order

1. `GET /home` — public smoke test  
2. `GET /brands/filters` + `GET /brands`  
3. `GET /brands/nexxas-kitchen` + reviews  
4. `POST /auth/login` — save token  
5. `GET /users/me/dashboard`  
6. `GET /brands/nexxas-kitchen/context`  
7. `POST /reviews` (new brand or delete old review first)  
8. `POST /reviews/:id/helpful`  
9. Admin login → `GET /admin/dashboard`  

---

## Third-party services — when you need them

| Service | Purpose | Required for dev? |
|---------|---------|-------------------|
| **Docker Postgres** | Database | **Yes** |
| **Termii** | SMS OTP | **No** — `OTP_DEV_MODE=true` or use seeded demo user |
| **Cloudinary** | Images | **No** — text reviews only |
| **Resend** | Email | **No** — not implemented |

### Resend vs Termii

- **Termii** = SMS (phone OTP) — already integrated  
- **Resend** = Email (password reset, welcome email) — **not built yet**  
- They are **not interchangeable** for phone OTP

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Can't reach database` | `docker compose up -d` |
| 401 on all routes | Missing/expired token; login again |
| 403 on POST /reviews | Not logged in, or editing someone else's review | Not phone verification (disabled in v1) |
| 503 on uploads | Set Cloudinary env vars or skip uploads |
| Swagger 401 | Click Authorize, paste token from login |
| CORS from frontend | Match `CORS_ORIGIN` in API `.env` |
