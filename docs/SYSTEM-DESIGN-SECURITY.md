# TalkGround — System design & security

**Audience:** Backend owner + anyone joining the project  
**Stack:** NestJS · PostgreSQL · Prisma · JWT · (optional) Cloudinary · Termii

---

## 1. What “claimed” means (and how a brand gets it)

`Brand.claimed` is a **boolean badge**, not a user-owned account.

| Fact | Detail |
|------|--------|
| Default | `false` |
| Effect on UI | Show “Claimed” / verified-business badge |
| Effect on trust | `+10` points in `computeTrustScore` (max contribution from claim) |
| Who can set it | **Only TalkGround ADMIN** via `POST/PATCH /admin/brands` |
| Public claim flow | **None in v1** — no “Claim this business” endpoint |

### How a company “achieves” claimed: true (v1)

1. Brand exists on TalkGround (admin creates it, or admin approves a user suggestion).
2. TalkGround team verifies the business offline (phone call, email from official domain, documents, etc.).
3. Admin calls:

```http
PATCH /api/v1/admin/brands/{brandId}
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json

{ "claimed": true }
```

4. Public `GET /brands/:slug` returns `claimed: true` and a higher trust score.

**There is no way for a random logged-in user to set `claimed`.** Guards require `role: ADMIN`. DTOs only expose `claimed` on admin create/update.

Future (not built): owner signup → email/domain proof → pending claim → admin approve. Until then, treat claim as **admin-only trust signal**.

---

## 2. System design (how the backend is shaped)

### 2.1 High-level

```
┌────────────┐   HTTPS + Bearer JWT   ┌─────────────────┐
│  Frontend  │ ──────────────────────► │  NestJS API     │
│  (Next.js) │ ◄────────────────────── │  /api/v1        │
└────────────┘                         │  /docs Swagger  │
                                       └────────┬────────┘
                              ┌─────────────────┼─────────────────┐
                              ▼                 ▼                 ▼
                        PostgreSQL         Cloudinary          Termii
                        (Prisma)           (optional)        (optional)
```

- **Frontend** owns UI and stores JWT (typically `localStorage`).
- **API** owns business rules, auth, trust checks, moderation.
- **Postgres** is the source of truth.
- **Cloudinary** stores images; API only signs upload params (no binary through Nest).
- **Termii** sends SMS OTP when wired; `OTP_DEV_MODE=true` skips SMS in early dev.

### 2.2 NestJS building blocks (every concept used)

| Concept | What it is in TalkGround |
|---------|---------------------|
| **Module** | Feature box (`AuthModule`, `BrandsModule`, …). Declares controllers + providers. |
| **Controller** | HTTP routes only — parse params/body, call service, return JSON. |
| **Service** | Business logic + Prisma queries. |
| **DTO** | Request shape + validation (`class-validator`). Rejects unknown fields (`forbidNonWhitelisted`). |
| **Prisma** | Type-safe SQL layer; schema in `prisma/schema.prisma`; migrations in `prisma/migrations`. |
| **Guard** | Gate before handler. Global `JwtAuthGuard` + `RolesGuard`. |
| **Decorator** | `@Public()`, `@Roles(ADMIN)`, `@CurrentUser()`, `@OptionalAuth()`. |
| **Strategy** | Passport JWT: read Bearer token → verify → load user → `request.user`. |
| **Pipe** | Global `ValidationPipe` transforms query/body and validates DTOs. |
| **Filter** | `GlobalExceptionFilter` maps exceptions → `{ error: { code, message } }`. |
| **Config** | `ConfigModule` loads `.env` / platform env vars. |
| **Swagger** | OpenAPI at `/docs` from decorators + DTOs. |

### 2.3 Request lifecycle

```
HTTP request
  → CORS check
  → Global prefix /api/v1
  → ValidationPipe (DTO)
  → JwtAuthGuard (skip if @Public)
  → RolesGuard (skip if no @Roles)
  → Controller → Service → Prisma
  → JSON { data } or filter → { error }
```

### 2.4 Domain modules (why they exist)

| Module | Job |
|--------|-----|
| **Auth** | Register/login, bcrypt passwords, JWT issue, OTP stubs |
| **Home** | Landing feed aggregation (trusted cards, sectors, top rated week) |
| **Brands** | Explore, filters+counts, brand detail, user review context |
| **Reviews** | CRUD, sort, helpful, report, media attach, trust flags |
| **Users** | Me profile, dashboard stats, public profile by username |
| **Admin** | Brand CRUD + **claimed**, moderation queues, suspend users, suggestions |
| **Uploads** | Cloudinary signed upload params |
| **Growth** | Survey responses + waitlist |
| **Prisma** | Shared DB client |

### 2.5 Data model (core)

```
User ──< Review >── Brand
  │         │
  │         ├── ReviewMedia
  │         ├── ReviewReport
  │         └── HelpfulVote
  │
  └── BrandSuggestion → (admin approve) → Brand
```

Enums of note: `BrandCategory` (RESTAURANTS / HOTELS), `City` (LAGOS / ABUJA), `ReviewStatus`, `UserRole` (USER / ADMIN).

### 2.6 Trust score design

Computed (not stored as primary truth) from:

- rating quality (~50)
- review volume (~25)
- verified review ratio (~15)
- **claimed badge (+10)**

Used on brand cards and detail for ranking/display.

### 2.7 “Top rated this week”

Average of ratings from reviews in the **last 7 days**, tie-break by count; if fewer than 5 brands qualify, backfill with all-time.

---

## 3. App flow (end-to-end)

### Guest browse

1. `GET /home` → landing sections  
2. `GET /brands/filters` + `GET /brands?...` → explore  
3. `GET /brands/:slug` + `GET /brands/:slug/reviews` → brand page  
4. Optional register/login

### Write a review

1. Login → store `accessToken`  
2. `GET /brands/:slug/context` → Write vs Edit  
3. Optional: `POST /uploads/signature` → upload to Cloudinary  
4. `POST /reviews` → create  
5. Optional: `POST /reviews/:id/media`  
6. Brand page refreshes reviews

### Moderation

1. Admin login (`role: ADMIN`)  
2. `GET /admin/reviews/queue?queue=flagged`  
3. `PATCH /admin/reviews/:id` with action  
4. Claim brand: `PATCH /admin/brands/:id` `{ claimed: true }`

---

## 4. Security measures (what is in place)

### 4.1 Authentication & authorization

| Control | How |
|---------|-----|
| Passwords | `bcrypt` hashed; never stored plain |
| Sessions | Stateless **JWT** (`sub` = user id); expiry via `JWT_EXPIRES_IN` |
| Secret | `JWT_SECRET` must be strong in production |
| Default deny | Global `JwtAuthGuard` — routes public only with `@Public()` |
| Roles | `@Roles(ADMIN)` + `RolesGuard` for `/admin/*` |
| Claimed field | Only on admin DTOs; no public claim endpoint |

### 4.2 Input validation

- DTOs + `whitelist` + `forbidNonWhitelisted` → strip/reject unexpected fields  
- Enum transforms (e.g. `lagos` → `LAGOS`)  
- Length / URL / rating bounds on review and brand fields  

### 4.3 CORS

- `CORS_ORIGIN` + known localhost origins  
- Browsers block other sites from calling the API with cookies/credentials patterns; JWT still must not be leaked  

### 4.4 Review trust / anti-abuse (application level)

| Check | Purpose |
|-------|---------|
| One review per user per brand | Unique constraint / service check |
| Rate limit in code | e.g. max reviews per 24h per user |
| Text / IP hashing | Similarity / velocity signals for flagging |
| Flagged status | Auto or manual → admin queue |
| Helpful votes | Authenticated; track `helpfulByMe` |
| Suspended users | Admin can suspend → blocked from actions |

### 4.5 Uploads

- API never receives raw files in the happy path  
- Signed Cloudinary params; secrets stay on server  
- Without Cloudinary env → `503` on signature (safe fail)

### 4.6 Admin surface

- Separate role; seed admin only for bootstrap  
- Soft-delete / deactivate brands instead of hard wipe where possible  
- Moderation actions audited via status fields / notes  

### 4.7 Operational security (you must do on Render)

| Do | Why |
|----|-----|
| Strong unique `JWT_SECRET` | Prevent token forgery |
| Never commit `.env` | Secrets stay off GitHub |
| HTTPS only (Render default) | Protect tokens in transit |
| Restrict `CORS_ORIGIN` in prod | Limit browser abuse |
| Rotate admin password after seed | Seed passwords are public in docs |
| Keep `OTP_DEV_MODE=false` when Termii is live | Avoid OTP in logs |

### 4.8 Not yet / planned

| Gap | Notes |
|-----|--------|
| Redis rate limiting | In-code limits only today |
| Refresh token rotation | `refreshToken` ≈ access for now |
| Public business claim + ownership | Admin-only claim until built |
| Email verification enforcement | Optional; JWT enough for v1 reviews |
| WAF / bot protection | Platform-level later |

---

## 5. Deployment topology (Render)

See [RENDER-DEPLOYMENT.md](./RENDER-DEPLOYMENT.md).

```
GitHub → Render Web Service (apps/api)
              ↓
         Render / Neon Postgres
```

Platform injects `PORT`. Start command runs migrations then `start:prod`.

---

## 6. Mental model for learning

1. **HTTP** hits a **controller**.  
2. **Guards** decide if you’re allowed.  
3. **DTO** cleans the input.  
4. **Service** applies product rules.  
5. **Prisma** reads/writes **Postgres**.  
6. Response is always `{ data }` or `{ error }`.

If you understand those six steps, you understand this entire backend.
