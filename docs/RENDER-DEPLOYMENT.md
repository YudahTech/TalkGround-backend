# Revyu — Render deployment (API + Postgres)

**Use this when Railway trial has expired.**  
**Repo:** https://github.com/YudahTech/Revyu-backend  
**Goal:** Live NestJS API + Swagger URL for the frontend team.

---

## What you will have when done

| Item | Example |
|------|---------|
| API base | `https://revyu-api.onrender.com/api/v1` |
| Swagger | `https://revyu-api.onrender.com/docs` |
| OpenAPI JSON | `https://revyu-api.onrender.com/docs/openapi.json` |

Frontend sets:

```env
NEXT_PUBLIC_API_URL=https://revyu-api.onrender.com/api/v1
```

---

## Architecture on Render

```
GitHub (YudahTech/Revyu-backend)
        │
        ▼
┌───────────────────┐     private URL      ┌─────────────────┐
│  Web Service      │ ───────────────────► │  PostgreSQL     │
│  NestJS (apps/api)│                      │  Render DB      │
│  PORT = injected  │                      └─────────────────┘
└───────────────────┘
        │
        ▼ HTTPS
   Swagger /docs + REST /api/v1
```

Render free tier: web services **spin down** after ~15 minutes idle. First request after sleep can take 30–60s. Fine for demos; upgrade later for always-on.

---

## Prerequisites

1. GitHub repo `Revyu-backend` pushed and up to date
2. Render account: https://dashboard.render.com → Sign up with GitHub
3. Local API still works (optional, for comparison)

---

## Step 1 — Create PostgreSQL

1. Dashboard → **New +** → **PostgreSQL**
2. Name: `revyu-db`
3. Database: `revyu` (or leave default)
4. Region: closest to you (e.g. Frankfurt / Oregon)
5. Plan: **Free** (or paid if you need persistence beyond free limits)
6. Create → wait until **Available**

### Copy connection string

Open the DB → **Connections** → copy **Internal Database URL** (preferred when API is on Render)  
or **External Database URL** if you need to connect from your laptop.

Format looks like:

```text
postgresql://USER:PASSWORD@HOST/DATABASE
```

You will paste this as `DATABASE_URL` on the web service.

> Free Postgres on Render can expire after inactivity. For long-term demos, use a paid DB or Neon/Supabase free Postgres and point `DATABASE_URL` there.

---

## Step 2 — Create Web Service (Nest API)

1. **New +** → **Web Service**
2. Connect GitHub → select **YudahTech/Revyu-backend**
3. Configure:

| Setting | Value |
|---------|--------|
| **Name** | `revyu-api` |
| **Region** | Same as Postgres |
| **Root Directory** | `apps/api` |
| **Runtime** | Node |
| **Build Command** | `npx prisma generate && npm run build` |
| **Start Command** | `npx prisma migrate deploy && npm run start:prod` |
| **Instance type** | Free |

### Why these commands?

| Command | Purpose |
|---------|---------|
| `npx prisma generate` | Generate Prisma Client for production |
| `npm run build` | Compile Nest → `dist/` |
| `npx prisma migrate deploy` | Apply SQL migrations to Render Postgres |
| `npm run start:prod` | `node dist/main` |

**Do not set `PORT` yourself.** Render injects `PORT`. Nest already uses `process.env.PORT ?? 3001`.

---

## Step 3 — Environment variables

Web Service → **Environment** → add:

### Required

| Variable | Value | Notes |
|----------|--------|--------|
| `DATABASE_URL` | Internal (or External) Postgres URL from Step 1 | Must include `?schema=public` if you use schemas; Prisma usually works with Render’s URL as-is |
| `JWT_SECRET` | Long random string | Generate below — never commit |
| `JWT_EXPIRES_IN` | `7d` | Same as local |
| `CORS_ORIGIN` | Your frontend origin | e.g. `http://localhost:3000` or `https://revyu.vercel.app` |
| `OTP_DEV_MODE` | `true` | Until Termii is live — OTP prints in logs |

### Generate JWT_SECRET (PowerShell)

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Optional (later)

| Variable | When |
|----------|------|
| `TERMII_API_KEY` | Real SMS OTP |
| `TERMII_SENDER_ID` | e.g. `Revyu` |
| `CLOUDINARY_CLOUD_NAME` | Photo uploads |
| `CLOUDINARY_API_KEY` | Photo uploads |
| `CLOUDINARY_API_SECRET` | Photo uploads |
| `OTP_DEV_MODE` | Set `false` when Termii is ready |

### CORS tip

If frontend is local and API is on Render:

```text
CORS_ORIGIN=http://localhost:3000
```

If frontend is also deployed, set that production URL. Multiple origins: today the API also allows localhost; for production, prefer one real frontend URL in `CORS_ORIGIN`.

---

## Step 4 — Deploy

1. Click **Create Web Service** / **Save**
2. Watch **Logs** until you see Nest listening (or “Application is running”)
3. Open:

```text
https://<your-service-name>.onrender.com/docs
```

4. Test login in Swagger:

- `POST /api/v1/auth/login` with seed admin after seeding (next step)

---

## Step 5 — Seed the database (once)

Render does **not** run seed automatically. From your laptop (with External `DATABASE_URL`):

```powershell
cd apps/api
$env:DATABASE_URL="postgresql://...external-url-from-render..."
npx prisma migrate deploy
npx prisma db seed
```

Or add a one-off **Shell** / temporary job on Render if available on your plan.

Seed creates:

| Email | Password | Role |
|-------|----------|------|
| `chinedu.okafor@gmail.com` | `demo1234` | USER |
| `admin@revyu.ng` | `admin123` | ADMIN |

Plus sample brands (some with `claimed: true`).

---

## Step 6 — Give frontend the URLs

| Env | Value |
|-----|--------|
| `NEXT_PUBLIC_API_URL` | `https://revyu-api.onrender.com/api/v1` |
| Swagger (manual testing) | `https://revyu-api.onrender.com/docs` |

If cold start is slow, tell them: wait ~1 minute on first hit after idle.

---

## Step 7 — Verify checklist

- [ ] `GET https://.../api/v1/home` returns JSON
- [ ] `/docs` loads Swagger
- [ ] Login works with seeded user
- [ ] `GET /brands` returns brands
- [ ] Frontend CORS works (no browser CORS errors)
- [ ] Admin can `PATCH /admin/brands/:id` with `{ "claimed": true }`

---

## Common failures

| Problem | Fix |
|---------|-----|
| Build fails on Prisma | Root Directory must be `apps/api`; run `prisma generate` in build |
| App crashes on start | Check `DATABASE_URL`; ensure migrate deploy ran |
| 502 / sleep | Free tier cold start — wait and retry |
| CORS errors | Set `CORS_ORIGIN` to exact frontend origin (scheme + host + port) |
| Empty DB | Run seed against External URL |
| Wrong port | Do not set `PORT` manually |

---

## Neon / Supabase alternative for Postgres

If Render free Postgres is too limited:

1. Create free Postgres on [Neon](https://neon.tech) or [Supabase](https://supabase.com)
2. Copy connection string → `DATABASE_URL` on Render web service
3. Keep Nest on Render; only DB is external

---

## Redeploy

Every push to the connected GitHub branch redeploys automatically (if Auto-Deploy is on).

Manual: Dashboard → service → **Manual Deploy** → **Deploy latest commit**.

---

## Related docs

- [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md) — endpoints + app flow
- [SYSTEM-DESIGN-SECURITY.md](./SYSTEM-DESIGN-SECURITY.md) — architecture + security
- [RAILWAY-DEPLOYMENT.md](./RAILWAY-DEPLOYMENT.md) — old Railway guide (trial expired)
