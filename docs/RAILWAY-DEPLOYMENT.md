# TalkGround — Railway deployment (legacy)

> **Prefer Render.** Railway free trial expired for this project.  
> Use **[RENDER-DEPLOYMENT.md](./RENDER-DEPLOYMENT.md)** for the live API.

**Repo:** https://github.com/YudahTech/TalkGround-backend  
**Goal:** Live API + Swagger URL you can send to the frontend developer.

---

## What you will have when done

| Item | Example |
|------|---------|
| API base | `https://talkground-backend-production-xxxx.up.railway.app/api/v1` |
| Swagger | `https://talkground-backend-production-xxxx.up.railway.app/docs` |
| OpenAPI JSON | `https://...up.railway.app/docs/openapi.json` |

GitHub docs (already public):

- https://github.com/YudahTech/TalkGround-backend/blob/master/docs/FRONTEND-INTEGRATION.md

---

## Prerequisites

1. GitHub account with `TalkGround-backend` pushed (done)
2. Railway account: https://railway.app → Sign up with GitHub
3. Docker/local API working (optional, for comparison)

---

## Step 1 — Create a Railway project

1. Open https://railway.app/new
2. Choose **Deploy from GitHub repo**
3. Authorize Railway → select **YudahTech/TalkGround-backend**
4. Create the project

---

## Step 2 — Add PostgreSQL

1. In the project → **+ New** → **Database** → **Add PostgreSQL**
2. Wait until it says **Online**
3. Click the Postgres service → **Variables** (or **Connect**)
4. Copy **`DATABASE_URL`** (or `DATABASE_PRIVATE_URL` for private networking)

**Use the public `DATABASE_URL`** if the API and DB are in the same Railway project — Railway often injects it automatically when you link services.

### Link DB to API service

1. Click your **API / GitHub service** (not Postgres)
2. **Variables** → **Add variable** → **Add reference** (or “Variable reference”)
3. Reference Postgres `DATABASE_URL`  
   **OR** paste the connection string manually

---

## Step 3 — Configure the API service (monorepo)

Because the Nest app lives in `apps/api`:

1. Open the **service** connected to GitHub
2. **Settings** → **Root Directory** → set to:

```text
apps/api
```

3. **Settings** → **Build**

| Setting | Value |
|---------|--------|
| **Build Command** | `npx prisma generate && npm run build` |
| **Start Command** | `npx prisma migrate deploy && npm run start:prod` |

(If Railway auto-detects poorly, set these under **Settings → Deploy**.)

4. **Watch Paths** (optional): `apps/api/**`

### Why these commands?

| Command | Purpose |
|---------|---------|
| `prisma generate` | Create Prisma Client for production |
| `npm run build` | Compile Nest → `dist/` |
| `prisma migrate deploy` | Apply migrations to Railway Postgres (safe for prod) |
| `npm run start:prod` | `node dist/main` |

---

## Step 4 — Environment variables (from `.env`)

Open API service → **Variables** → add these.

### Required for v1 (frontend can integrate)

| Variable | What to put | Notes |
|----------|-------------|--------|
| `DATABASE_URL` | From Railway Postgres (reference) | **Do not** use local `localhost:5433` |
| `JWT_SECRET` | Long random string (see below) | **Never** use `change-me-in-production...` |
| `JWT_EXPIRES_IN` | `7d` | Same as local |
| `CORS_ORIGIN` | Frontend URL | e.g. `http://localhost:3000` now, later `https://talkground.vercel.app` |
| `OTP_DEV_MODE` | `true` | Keep `true` until Termii is ready |

**Generate a strong JWT secret (run locally):**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Paste the output as `JWT_SECRET`.

### Do **not** set `PORT` on Railway

Railway injects `PORT` automatically. Your `main.ts` already uses `process.env.PORT`. Setting `3001` can break health checks.

### Optional (leave empty for now)

| Variable | When needed |
|----------|-------------|
| `TERMII_API_KEY` | Real SMS OTP |
| `TERMII_SENDER_ID` | e.g. `TalkGround` (approved sender) |
| `CLOUDINARY_CLOUD_NAME` | Photo / avatar uploads |
| `CLOUDINARY_API_KEY` | Uploads |
| `CLOUDINARY_API_SECRET` | Uploads |
| `RESEND_API_KEY` | Not wired yet — skip |

### Recommended staging values (copy-paste checklist)

```env
JWT_SECRET=<paste-64-byte-hex>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
OTP_DEV_MODE=true
TERMII_API_KEY=
TERMII_SENDER_ID=TalkGround
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Plus `DATABASE_URL` from the Postgres plugin.

**Multiple frontend origins later:** Nest currently takes one `CORS_ORIGIN`. For local + Vercel, temporarily use the Vercel URL once frontend is deployed, or ask backend to support a comma-separated list.

---

## Step 5 — Generate a public domain

1. API service → **Settings** → **Networking** → **Generate Domain**
2. Copy the URL, e.g. `https://talkground-backend-production-xxxx.up.railway.app`
3. Your public paths:

```text
API:     https://THAT-HOST/api/v1
Swagger: https://THAT-HOST/docs
OpenAPI: https://THAT-HOST/docs/openapi.json
```

---

## Step 6 — Deploy & watch logs

1. **Deploy** (or push to `master` — Railway auto-redeploys)
2. Open **Deployments** → **View Logs**
3. Success looks like:

```text
Nest application successfully started
TalkGround API running on http://localhost:PORT/api/v1
Swagger UI: http://localhost:PORT/docs
```

### Common failures

| Log / error | Fix |
|-------------|-----|
| `Can't reach database` | `DATABASE_URL` missing or wrong; link Postgres |
| `P1001` / connection refused | Use Railway’s URL, not localhost |
| `No schema` / migrate fail | Ensure `prisma migrate deploy` in start command; migrations folder is in repo |
| Build fails `prisma` | Root Directory must be `apps/api` |
| App sleeps / 502 | Free tier sleep — hit URL to wake; or upgrade |

---

## Step 7 — Seed production data (once)

After first successful migrate, seed admin + demo brands:

**Option A — Railway CLI**

```bash
npm i -g @railway/cli
railway login
railway link
cd apps/api
railway run npx prisma db seed
```

(If seed script fails, run: `railway run npx ts-node --project prisma/tsconfig.json prisma/seed.ts` after `prisma generate`.)

**Option B — One-off locally against prod DB**

```bash
cd apps/api
# Temporarily set DATABASE_URL to Railway's URL in your shell only — do not commit
$env:DATABASE_URL="postgresql://..."   # PowerShell
npx prisma migrate deploy
npx prisma generate
npx ts-node --project prisma/tsconfig.json prisma/seed.ts
```

Then **change admin password** in production as soon as you can.

Seed accounts (same as local):

| Email | Password | Role |
|-------|----------|------|
| `a seeded demo account` | <demo password, shared privately> | USER |

---

## Step 8 — Verify deployment

In browser:

1. `https://YOUR-HOST/docs` → Swagger loads  
2. `https://YOUR-HOST/api/v1/home` → JSON with `trustedBrandCards` / `sectorBrands`  
3. Swagger → `POST /auth/login` with demo user → Authorize → `GET /users/me`

---

## Step 9 — What to send the frontend

When Steps 5–8 pass:

```text
Repo: https://github.com/YudahTech/TalkGround-backend

Integration guide:
https://github.com/YudahTech/TalkGround-backend/blob/master/docs/FRONTEND-INTEGRATION.md

Staging API:  https://YOUR-HOST/api/v1
Swagger:      https://YOUR-HOST/docs
OpenAPI:      https://YOUR-HOST/docs/openapi.json

Frontend env:
NEXT_PUBLIC_API_URL=https://YOUR-HOST/api/v1

Demo: a seeded demo account / <demo password, shared privately>
(v1: JWT enough to write reviews — no phone OTP required)
```

Ask them to set `CORS_ORIGIN` on Railway to their frontend origin when they have one (e.g. Vercel URL).

---

## Security checklist before real users

- [ ] Strong `JWT_SECRET`
- [ ] `OTP_DEV_MODE=false` + Termii when SMS is ready
- [ ] Cloudinary keys when uploads are ready
- [ ] `CORS_ORIGIN` = real frontend domain only
- [ ] Change seed admin password
- [ ] Never commit `.env`

---

## Local vs Railway env cheat sheet

| Variable | Local Docker | Railway |
|----------|--------------|---------|
| `DATABASE_URL` | `localhost:5433` | Railway Postgres URL |
| `JWT_SECRET` | Dev string OK | Strong random |
| `CORS_ORIGIN` | `http://localhost:3000` | Frontend URL |
| `OTP_DEV_MODE` | `true` | `true` until Termii |
| `PORT` | `3001` | **Leave unset** |
| Cloudinary / Termii | Empty OK | Empty OK for v1 |
