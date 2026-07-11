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

**Recommended for demos:** Nest on Render + Postgres on Neon (or Supabase).

```
GitHub (YudahTech/Revyu-backend)
        │
        ▼
┌───────────────────┐     DATABASE_URL (SSL)    ┌─────────────────┐
│  Web Service      │ ─────────────────────────► │  Postgres       │
│  NestJS (apps/api)│                            │  Neon / Supabase│
│  PORT = injected  │                            │  (or Render DB) │
└───────────────────┘                            └─────────────────┘
        │
        ▼ HTTPS
   Swagger /docs + REST /api/v1
```

Render free web services **spin down** after ~15 minutes idle. First request after sleep can take 30–60s. Fine for demos; upgrade later for always-on.

Prisma only needs a valid `DATABASE_URL` — it does not care whether Postgres is on Render, Neon, or Supabase.

---

## Prerequisites

1. GitHub repo `Revyu-backend` pushed and up to date
2. Render account: https://dashboard.render.com → Sign up with GitHub
3. Local API still works (optional, for comparison)

---

## Step 1 — Choose Postgres (pick one)

| Option | When to use |
|--------|-------------|
| **A — Neon (recommended for demos)** | Free DB that lasts longer; skip Render Postgres |
| **B — Supabase** | Same idea as Neon; use if you already have Supabase |
| **C — Render Postgres** | Quick all-in-one; free tier can expire after inactivity |

For long-term demos, prefer **A** or **B**. Jump to [Neon + Render (recommended)](#neon--render-recommended) if you want that path only, then return here for the Web Service steps.

### Option C — Render PostgreSQL (optional)

1. Dashboard → **New +** → **PostgreSQL**
2. Name: `revyu-db`
3. Database: `revyu` (or leave default)
4. Region: closest to you (e.g. Frankfurt / Oregon)
5. Plan: **Free** (or paid if you need persistence)
6. Create → wait until **Available**
7. **Connections** → copy **Internal Database URL** (for the Web Service)  
   and **External Database URL** (for seeding from your laptop)

```text
postgresql://USER:PASSWORD@HOST/DATABASE
```

Paste that as `DATABASE_URL` on the web service (Step 3).

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
| **Build Command** | `npm install && npx prisma@5.22.0 generate && npm run build` |
| **Start Command** | `npx prisma@5.22.0 migrate deploy && npm run start:prod` |

`start:prod` runs `node dist/main.js` (Nest emits `dist/` from `src/`).
| **Instance type** | Free |

### Why these commands?

| Command | Purpose |
|---------|---------|
| `npm install` | Install deps from `apps/api` (see `.npmrc` — no monorepo workspace hoist) |
| `npx prisma@5.22.0 generate` | **Force Prisma 5** — bare `npx prisma` can download 7 and fail with P1012 |
| `npm run build` | Compile Nest → `dist/` |
| `npx prisma@5.22.0 migrate deploy` | Apply SQL migrations to Neon/Render Postgres |
| `npm run start:prod` | `node dist/main` |

**Important:** This project uses **Prisma 5** (`url = env("DATABASE_URL")` in `schema.prisma`). Always pin `@5.22.0` in Render commands until you deliberately upgrade to Prisma 7.

**Docker note:** Local Docker only runs **Postgres** on port 5433. Render does **not** use that Docker container. On Render/Neon you only set `DATABASE_URL` to the cloud database.

**Do not set `PORT` yourself.** Render injects `PORT`. Nest already uses `process.env.PORT ?? 3001`.

---

## Step 3 — Environment variables

Web Service → **Environment** → add:

### Required

| Variable | Value | Notes |
|----------|--------|--------|
| `DATABASE_URL` | Neon / Supabase URI **or** Render Internal URL | Prefer Neon for demos; must be reachable from Render (SSL usually required) |
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

Neither Render nor Neon runs seed automatically. From your laptop, point at the **same** DB the API uses:

```powershell
cd apps/api
# Neon example (recommended):
$env:DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require"
# Or Render External URL / Supabase URI
npx prisma migrate deploy
npx prisma db seed
```

See [Neon + Render (recommended)](#neon--render-recommended) for the full Neon checklist.

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
| Build fails on Prisma | Root Directory must be `apps/api`; run `npm install` then `prisma generate` |
| `P1012` / Prisma 7.x / `url is no longer supported` | Project is Prisma **5**. Ensure `prisma` is in dependencies (done) and Build Command starts with `npm install`. Redeploy after pushing. Do not upgrade to Prisma 7 on Render. |
| App crashes on start | Check `DATABASE_URL`; ensure migrate deploy ran |
| 502 / sleep | Free tier cold start — wait and retry |
| CORS errors | Set `CORS_ORIGIN` to exact frontend origin (scheme + host + port) |
| Empty DB | Run seed against Neon/External URL |
| Wrong port | Do not set `PORT` manually |
| Thinking Docker fixes Render | Docker is local only; cloud uses `DATABASE_URL` (Neon/Render Postgres) |

---

## Neon + Render (recommended)

Use this when you want a **stable free demo DB**. Nest stays on Render; only Postgres moves to Neon. **No code changes** — only env vars.

### Why this setup

| Point | Detail |
|-------|--------|
| Stable demos | Neon free DB is less likely to vanish from short inactivity than Render free Postgres |
| Split roles | Render runs the API; Neon stores data |
| Portable | Later move Nest anywhere; keep the same Neon `DATABASE_URL` |
| Same Prisma flow | `migrate deploy` + `db seed` work unchanged |

### How it works

1. Neon hosts Postgres and gives you a connection URI.
2. Render Web Service env `DATABASE_URL` points at that URI over the public internet (SSL).
3. On each deploy, `prisma migrate deploy` applies migrations **on Neon**.
4. Your laptop can use the **same** URI to seed or run Prisma Studio.

```
Your laptop ──┐
              ├── DATABASE_URL ──► Neon Postgres
Render API  ──┘
```

### Neon setup (click-through)

1. Open [https://console.neon.tech](https://console.neon.tech) → sign up with GitHub.
2. **Create project**
   - Name: `revyu`
   - Region: closest to your Render region (e.g. both EU or both US)
   - Postgres version: default is fine
3. After create, open **Dashboard** → **Connection details**.
4. Select connection string type **URI**.
5. Copy the string. It should look like:

```text
postgresql://neondb_owner:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
```

6. Prefer the **direct** connection (host like `ep-....neon.tech`) for Nest/Prisma.  
   If Neon shows a **pooled** URL (`-pooler`), it often works too; if migrations fail, switch to the non-pooler URI.

### Env checklist (Render Web Service → Environment)

Set these on `revyu-api` (create the Web Service first if you have not — Steps 2–3 above). **Do not create a Render Postgres** if you use Neon.

| Variable | Required | Example / source |
|----------|----------|------------------|
| `DATABASE_URL` | Yes | Full Neon URI with `sslmode=require` |
| `JWT_SECRET` | Yes | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Yes | `7d` |
| `CORS_ORIGIN` | Yes | `http://localhost:3000` or your Vercel URL |
| `OTP_DEV_MODE` | Yes (early) | `true` |
| `PORT` | **No** | Render injects this — leave unset |
| `TERMII_*` | No | Later |
| `CLOUDINARY_*` | No | Later |

After saving env vars → **Manual Deploy** → **Deploy latest commit**.

### Seed Neon from your laptop (once)

Use the **same** Neon URI (safe on your machine; never commit it):

```powershell
cd apps\api
$env:DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
npx prisma db seed
```

| Email | Password | Role |
|-------|----------|------|
| `chinedu.okafor@gmail.com` | `demo1234` | USER |
| `admin@revyu.ng` | `admin123` | ADMIN |

### Verify

- [ ] Render logs show Nest started (no Prisma connection errors)
- [ ] `https://revyu-api.onrender.com/api/v1/home` returns JSON
- [ ] `/docs` → login with seeded user works
- [ ] Neon dashboard → **Tables** shows `User`, `Brand`, `Review`, etc.

### Neon tips

| Tip | Detail |
|-----|--------|
| First query slow | Neon can scale to zero; wait a few seconds on cold start |
| Password reset | Neon console → reset role password → update Render `DATABASE_URL` |
| Local vs cloud | You can keep local Docker Postgres for day-to-day; use Neon only for the live API |
| Don’t mix DBs | One `DATABASE_URL` per environment — don’t point Render at local `localhost` |

---

## Supabase + Render (alternative)

Same pattern as Neon; only the URI source changes.

1. [https://supabase.com](https://supabase.com) → New project → wait until healthy.
2. **Project Settings → Database → Connection string → URI**.
3. Replace `[YOUR-PASSWORD]` with the DB password you set at project creation.
4. For Nest/Prisma, prefer the **direct** connection (port `5432`) over transaction pooler when running migrations.
5. Paste into Render `DATABASE_URL` and use the same env checklist as Neon.
6. Seed from your laptop with that URI (`migrate deploy` + `db seed`).

---

## Redeploy

Every push to the connected GitHub branch redeploys automatically (if Auto-Deploy is on).

Manual: Dashboard → service → **Manual Deploy** → **Deploy latest commit**.

---

## Related docs

- [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md) — endpoints + app flow
- [SYSTEM-DESIGN-SECURITY.md](./SYSTEM-DESIGN-SECURITY.md) — architecture + security
- [RAILWAY-DEPLOYMENT.md](./RAILWAY-DEPLOYMENT.md) — old Railway guide (trial expired)
