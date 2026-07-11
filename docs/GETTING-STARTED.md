# Revyu — Getting Started (Developer Guide)

**Audience:** Developers joining the Revyu project  
**Project path:** `c:\Users\USER\Desktop\revyu`

---

## 1. What is Revyu?

Revyu is a **trust-first review platform** for restaurants and hotels in **Lagos and Abuja**. MVP success = users can find a brand, read credible reviews, and leave their own.

This is a **separate project** from `bango-market-day-frontend`. Do not mix the two repos.

---

## 2. What has been built

### Monorepo structure

```
revyu/
├── docs/                    # All product + engineering documentation
├── apps/
│   ├── api/                 # NestJS backend (port 3001)
│   │   ├── prisma/          # Database schema + seed
│   │   └── src/
│   │       ├── auth/        # Register, login, JWT, Termii OTP
│   │       ├── brands/      # Public brand listing + detail
│   │       ├── reviews/     # CRUD, trust flagging, reports
│   │       ├── growth/      # Survey + waitlist endpoints
│   │       ├── users/       # Public profiles, my reviews
│   │       ├── admin/       # Dashboard, moderation, brand CRUD
│   │       └── uploads/     # Cloudinary signed uploads
│   └── web/                 # Next.js frontend (port 3000)
│       └── src/app/         # All pages (see list below)
├── docker-compose.yml       # PostgreSQL for local dev
└── package.json             # Workspace root
```

### Frontend pages (all implemented)

| Route | Purpose |
|---|---|
| `/` | Home |
| `/survey` | Validation survey |
| `/waitlist` | Launch waitlist |
| `/brands` | Browse brands |
| `/brand/[slug]` | Brand detail (most important page) |
| `/category/restaurants` | Restaurant category |
| `/category/hotels` | Hotels category |
| `/login`, `/register`, `/forgot-password` | Auth |
| `/review/[slug]` | Write review (photos + receipt upload) |
| `/dashboard/reviews` | My reviews |
| `/u/[username]` | Public profile |
| `/suggest-brand` | Suggest a missing brand |
| `/admin` | Moderation dashboard |
| `/admin/brands` | Brand management CRUD |
| `/terms`, `/privacy`, `/review-guidelines` | Legal pages |

### Backend API modules

| Module | Key endpoints |
|---|---|
| Auth | `POST /auth/register`, `/login`, `/verify-phone/send-otp` |
| Brands | `GET /brands`, `GET /brands/:slug` |
| Reviews | `POST /reviews`, `PATCH /reviews/:id`, `POST /reviews/:id/report` |
| Growth | `POST /survey/responses`, `POST /waitlist` |
| Admin | `GET /admin/dashboard`, `PATCH /admin/reviews/:id` |
| Uploads | `POST /uploads/signature` (Cloudinary) |

### Trust features (built)

- Email + phone OTP before first review
- IP hash flagging, duplicate text flagging, velocity flagging
- New account + 1-star auto-flag
- User report flow
- Receipt upload → admin verification → "Verified visit" badge
- Founder moderation queues

### Seed data

After `npm run prisma:seed`:

- **Admin:** `admin@revyu.ng` / `admin123`
- **Sample brands:** Nexxa's Kitchen, Jollof Palace, Transcorp Hilton, Skyline Shortlets

---

## 3. Your first-time setup (step by step)

### Step 1 — Install tools

See [ENVIRONMENT-SETUP.md](./ENVIRONMENT-SETUP.md). Minimum:

- Node.js 20+
- Docker Desktop (recommended for PostgreSQL)
- Git
- VS Code or Cursor

### Step 2 — Start PostgreSQL

```bash
cd c:\Users\USER\Desktop\revyu
docker compose up -d
```

### Step 3 — Install dependencies

```bash
cd c:\Users\USER\Desktop\revyu
npm install
cd apps/api && npm install
cd ../web && npm install
```

### Step 4 — Configure environment

```bash
# API
copy apps\api\.env.example apps\api\.env

# Web
copy apps\web\.env.example apps\web\.env.local
```

Default `DATABASE_URL` in `.env.example` matches Docker Compose.

### Step 5 — Database migrate + seed

```bash
cd apps/api
npx prisma migrate dev --name init
npm run prisma:seed
```

### Step 6 — Run both apps

**Terminal 1 — API:**
```bash
cd apps/api
npm run start:dev
```
→ http://localhost:3001/api/v1

**Terminal 2 — Web:**
```bash
cd apps/web
npm run dev
```
→ http://localhost:3000

### Step 7 — Verify it works

1. Open http://localhost:3000
2. Visit `/brands` — see 4 seeded brands
3. Visit `/survey` and `/waitlist` — submit test entries
4. Register a new user at `/register`
5. Log in as admin: `admin@revyu.ng` / `admin123`
6. Visit `/admin` and `/admin/brands`

---

## 4. Optional services (for full features)

| Service | Required for | Env vars |
|---|---|---|
| Cloudinary | Photo/receipt uploads | `CLOUDINARY_*` in `apps/api/.env` |
| Termii | Production SMS OTP | `TERMII_API_KEY`, `OTP_DEV_MODE=false` |
| Resend | Email (future) | Not wired yet |

Without Cloudinary, uploads will fail — everything else works.

In dev, OTP logs to the API terminal when `OTP_DEV_MODE=true`.

---

## 5. Daily development workflow

```bash
# Start DB (if not running)
docker compose up -d

# Start API
cd apps/api && npm run start:dev

# Start Web (separate terminal)
cd apps/web && npm run dev
```

**Useful commands:**

```bash
# Open database GUI
cd apps/api && npm run prisma:studio

# After schema changes
cd apps/api && npx prisma migrate dev --name describe_your_change

# Re-seed
cd apps/api && npm run prisma:seed

# Build check
cd apps/api && npm run build
cd apps/web && npm run build
```

---

## 6. Where to look when building

| Task | Read first | Code location |
|---|---|---|
| New API endpoint | API-SPECIFICATION.md | `apps/api/src/` |
| New page | WIREFRAME-BRIEF.md | `apps/web/src/app/` |
| Database change | DATABASE-SCHEMA.md | `apps/api/prisma/schema.prisma` |
| Trust/moderation | ADMIN-MODERATION-SOP.md | `apps/api/src/reviews/`, `apps/api/src/admin/` |
| Uploads | ARCHITECTURE.md | `apps/api/src/uploads/`, `apps/web/src/lib/upload.ts` |

---

## 7. What's still pending

See [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md). Highlights:

- Resend email integration
- Redis rate limiting
- Edit review pre-fill
- Production deployment (see DEPLOYMENT-GUIDE.md)
- CAC registration + legal review before public launch

---

## 8. Learning path

If you need to refresh on the stack, work through:

**[COURSE-NESTJS-POSTGRES-PRISMA-DOCKER.md](./COURSE-NESTJS-POSTGRES-PRISMA-DOCKER.md)**

Each module references real files in this codebase.
