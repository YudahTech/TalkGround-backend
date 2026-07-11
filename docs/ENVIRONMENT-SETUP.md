# Revyu — Environment Setup

---

## Required software

| Tool | Version | Purpose | Install |
|---|---|---|---|
| Node.js | 20+ | Run API + web | https://nodejs.org |
| npm | 10+ | Package manager | Comes with Node |
| Docker Desktop | Latest | PostgreSQL locally | https://docker.com/products/docker-desktop |
| Git | Latest | Version control | https://git-scm.com |
| Cursor / VS Code | Latest | IDE | Your choice |

### Optional

| Tool | Purpose |
|---|---|
| Postman or Insomnia | Test API endpoints |
| Prisma Studio | Visual database browser (`npm run prisma:studio`) |
| pgAdmin | Alternative PostgreSQL GUI |

---

## Project location

```
c:\Users\USER\Desktop\revyu
```

**Not** inside `bango-market-day-frontend`.

---

## Environment files

### API — `apps/api/.env`

Copy from `.env.example`:

```bash
copy apps\api\.env.example apps\api\.env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Long random string for tokens |
| `JWT_EXPIRES_IN` | Yes | Default: `7d` |
| `PORT` | Yes | API port, default `3001` |
| `CORS_ORIGIN` | Yes | Frontend URL, default `http://localhost:3000` |
| `OTP_DEV_MODE` | Yes | `true` = log OTP to console; `false` = use Termii |
| `TERMII_API_KEY` | Prod only | Termii SMS API key |
| `TERMII_SENDER_ID` | Prod only | SMS sender name (max 11 chars) |
| `CLOUDINARY_CLOUD_NAME` | For uploads | Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | For uploads | Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | For uploads | Cloudinary dashboard |

**Default DATABASE_URL (matches Docker Compose):**
```
postgresql://postgres:password@localhost:5432/revyu?schema=public
```

### Web — `apps/web/.env.local`

```bash
copy apps\web\.env.example apps\web\.env.local
```

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:3001/api/v1` |

---

## External service setup

### 1. Cloudinary (image uploads)

1. Sign up at https://cloudinary.com
2. Dashboard → copy Cloud Name, API Key, API Secret
3. Add to `apps/api/.env`

### 2. Termii (SMS OTP — production)

1. Sign up at https://termii.com
2. Get API key from dashboard
3. Register sender ID (e.g. `Revyu`)
4. Set `OTP_DEV_MODE=false` and add keys to `.env`

### 3. PostgreSQL options

**Option A — Docker (recommended):**
```bash
cd c:\Users\USER\Desktop\revyu
docker compose up -d
```
See [DOCKER-SETUP.md](./DOCKER-SETUP.md).

**Option B — Local PostgreSQL install:**
- Install PostgreSQL 15+
- Create database: `CREATE DATABASE revyu;`
- Update `DATABASE_URL` in `.env`

**Option C — Cloud (Railway, Supabase, Neon):**
- Create PostgreSQL instance
- Copy connection string to `DATABASE_URL`

---

## Verify installation

```bash
node -v          # Should be v20+
docker -v        # Should print version
cd apps/api && npx prisma --version
cd apps/web && npx next --version
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `No driver (HTTP) has been selected` / `@nestjs/platform-express` | Monorepo hoisting: from repo root run `npm install` or `npm install @nestjs/platform-express express -w apps/api` |
| `Can't reach database` | Run `docker compose up -d`; check `DATABASE_URL` |
| Port 5432 in use | Stop other PostgreSQL or change Docker port mapping |
| Port 3001 in use | Change `PORT` in `apps/api/.env` |
| CORS errors | Ensure `CORS_ORIGIN` matches your Next.js URL |
| Cloudinary upload fails | Check all three `CLOUDINARY_*` vars are set |
| OTP not received | Dev mode: check API terminal logs; prod: check Termii balance |
