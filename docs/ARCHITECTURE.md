# Revyu — System Architecture

**Version:** 1.0  
**Stack:** Next.js + NestJS + PostgreSQL + Prisma + Cloudinary

---

## 1. High-level diagram

```
┌─────────────┐     HTTPS/HTTP      ┌─────────────┐
│   Browser   │ ◄─────────────────► │   Next.js   │
│   (User)    │                     │   (Vercel)  │
└─────────────┘                     │  port 3000  │
                                    └──────┬──────┘
                                           │ REST JSON
                                           │ Bearer JWT
                                    ┌──────▼──────┐
                                    │   NestJS    │
                                    │   (Railway) │
                                    │  port 3001  │
                                    └──┬───┬───┬──┘
                         ┌─────────────┘   │   └─────────────┐
                         ▼                 ▼                 ▼
                  ┌────────────┐  ┌────────────┐  ┌────────────┐
                  │ PostgreSQL │  │ Cloudinary │  │   Termii   │
                  │  (Prisma)  │  │  (images)  │  │   (SMS)    │
                  └────────────┘  └────────────┘  └────────────┘
```

---

## 2. Repository layout

### `apps/api` — NestJS backend

```
src/
├── main.ts              # Bootstrap, CORS, validation pipe, /api/v1 prefix
├── app.module.ts        # Root module, global guards
├── prisma/              # PrismaService (global)
├── auth/                # JWT auth, register, login, Termii OTP
├── brands/              # Public brand endpoints
├── reviews/             # Review CRUD + trust checks
├── growth/              # Survey + waitlist
├── users/               # Profiles
├── admin/               # Admin dashboard, moderation, brand CRUD
├── uploads/             # Cloudinary signed upload params
└── common/              # Decorators, filters, utils
```

### `apps/web` — Next.js frontend

```
src/
├── app/                 # App Router pages (one folder = one route)
├── components/          # Navbar, Footer, BrandCard, ReviewCard, etc.
└── lib/
    ├── api.ts           # Fetch wrapper for backend
    ├── auth.tsx         # Auth context (JWT in localStorage)
    ├── types.ts         # TypeScript interfaces
    ├── upload.ts        # Cloudinary client upload
    └── survey.ts        # Survey question definitions
```

---

## 3. Request flow examples

### Public: View brand page

```
1. User visits /brand/nexxas-kitchen
2. Next.js server calls GET /api/v1/brands/nexxas-kitchen
3. Next.js server calls GET /api/v1/brands/nexxas-kitchen/reviews
4. Page renders brand + reviews (SSR)
```

### Authenticated: Write review

```
1. User submits form at /review/nexxas-kitchen
2. Client uploads photos to Cloudinary via signed URL from POST /uploads/signature
3. Client POST /api/v1/reviews (JWT in header)
4. API runs trust checks → may flag review
5. Client POST /api/v1/reviews/:id/media for each photo/receipt URL
6. Redirect to brand page
```

### Admin: Moderate flagged review

```
1. Admin logs in → JWT with role ADMIN
2. GET /api/v1/admin/reviews/queue?queue=flagged
3. PATCH /api/v1/admin/reviews/:id { action: "approve" }
```

---

## 4. Authentication

| Aspect | Implementation |
|---|---|
| Token type | JWT (access token) |
| Storage (web) | `localStorage` (`revyu_token`, `revyu_user`) |
| Header | `Authorization: Bearer <token>` |
| Guards | `JwtAuthGuard` (global) + `RolesGuard` for admin |
| Public routes | `@Public()` decorator skips JWT |

---

## 5. Trust & anti-fraud pipeline

```
Review submitted
       │
       ▼
Account verified? (email + phone)
       │
       ▼
Rate limit OK? (3 per 24h)
       │
       ▼
Save review with ipHash + textHash
       │
       ▼
Automated checks:
  • IP match (>2 accounts, 7 days)
  • Duplicate text hash
  • Velocity (>5 reviews/brand/hour)
  • New account + 1-star
       │
       ▼
Any flags? → status = FLAGGED
       │
       ▼
Admin reviews queue (48h SLA)
```

---

## 6. Database access

All database access goes through **Prisma ORM**. No raw SQL in application code.

- Schema: `apps/api/prisma/schema.prisma`
- Migrations: `apps/api/prisma/migrations/`
- Seed: `apps/api/prisma/seed.ts`

---

## 7. Key design decisions

| Decision | Rationale |
|---|---|
| Monorepo (api + web) | Two devs can work in parallel; shared docs |
| Prisma over TypeORM | Type-safe queries, simpler migrations |
| JWT over sessions | Stateless API; works with separate frontend |
| Cloudinary direct upload | Reduces API bandwidth; signed URLs are secure |
| IP hashing (not raw IP) | NDPR-friendly; still catches duplicate accounts |
| Receipt images private | Trust without exposing personal purchase data |
| Founders-only moderation | MVP speed; hire moderators at scale |

---

## 8. Security notes

- Passwords hashed with bcrypt (10 rounds)
- Receipt images never returned in public API responses
- Admin routes require `role: ADMIN`
- Validation via `class-validator` on all DTOs
- CORS restricted to frontend origin

---

## 9. Scaling path (post-MVP)

| Bottleneck | Solution |
|---|---|
| Search | Algolia or PostgreSQL full-text → dedicated search |
| Rate limiting | Redis (Upstash) |
| File uploads | Already offloaded to Cloudinary |
| DB connections | Connection pooling (PgBouncer) |
| Background jobs | BullMQ for email, moderation alerts |
