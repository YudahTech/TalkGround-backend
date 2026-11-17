# TalkGround — Deployment Guide

**Target launch:** 1 August 2026

---

## Recommended hosting

| Component | Service | Why |
|---|---|---|
| Frontend (Next.js) | **Vercel** | Native Next.js, free tier, auto SSL |
| Backend (NestJS) | **Railway** or **Render** | Simple Node deploy, PostgreSQL addon |
| Database | **Railway PostgreSQL** or **Neon** | Managed, backups |
| Images | **Cloudinary** | Already integrated |
| SMS | **Termii** | Nigeria-first |
| Domain | **Namecheap** / **GoDaddy** | `revyu.ng` or similar |

---

## Pre-deployment checklist

- [ ] All env vars set (no dev defaults in production)
- [ ] `JWT_SECRET` is a long random string (64+ chars)
- [ ] `OTP_DEV_MODE=false`
- [ ] Cloudinary configured
- [ ] Termii configured and sender ID approved
- [ ] CORS_ORIGIN set to production domain
- [ ] Database migrations run on production DB
- [ ] Seed admin account (change default password!)
- [ ] Terms, Privacy, Review Guidelines reviewed by lawyer
- [ ] CAC company registered

---

## 1. Database (production)

### Option A — Railway

1. Create Railway project
2. Add PostgreSQL plugin
3. Copy `DATABASE_URL` from Railway dashboard
4. Run migrations locally against prod URL:
   ```bash
   cd apps/api
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   DATABASE_URL="postgresql://..." npm run prisma:seed
   ```

### Option B — Neon

1. Create project at neon.tech
2. Copy connection string
3. Same migrate commands as above

---

## 2. API deployment (Railway)

1. Connect GitHub repo (or deploy from `apps/api`)
2. Set root directory: `apps/api`
3. Build command: `npm run build`
4. Start command: `npm run start:prod`
5. Set environment variables:

```
DATABASE_URL=postgresql://...
JWT_SECRET=<long-random-string>
JWT_EXPIRES_IN=7d
PORT=3001
CORS_ORIGIN=https://revyu.ng
OTP_DEV_MODE=false
TERMII_API_KEY=...
TERMII_SENDER_ID=TalkGround
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

6. Note the deployed URL: `https://revyu-api.up.railway.app`

---

## 3. Frontend deployment (Vercel)

1. Import GitHub repo at vercel.com
2. Set root directory: `apps/web`
3. Framework: Next.js (auto-detected)
4. Environment variable:

```
NEXT_PUBLIC_API_URL=https://revyu-api.up.railway.app/api/v1
```

5. Deploy
6. Add custom domain: `revyu.ng`

---

## 4. Post-deploy verification

```bash
# Health check
curl https://your-api-url/api/v1/brands

# Should return JSON with brands array
```

Manual checks:
- [ ] Home page loads
- [ ] Survey submission works
- [ ] Waitlist submission works
- [ ] Register + login works
- [ ] OTP received via SMS (real phone)
- [ ] Photo upload works
- [ ] Admin dashboard accessible

---

## 5. CI/CD (recommended)

GitHub Actions on push to `main`:

```yaml
# .github/workflows/deploy.yml (create when ready)
# 1. Lint + build api
# 2. Lint + build web
# 3. Run prisma migrate deploy
# 4. Trigger Vercel + Railway deploys
```

---

## 6. Monitoring (post-launch)

| Tool | Purpose |
|---|---|
| Sentry | Error tracking (add to both apps) |
| Plausible / PostHog | Analytics |
| UptimeRobot | Uptime monitoring |

---

## 7. Rollback plan

- **Frontend:** Vercel instant rollback to previous deployment
- **API:** Railway redeploy previous build
- **Database:** Never run destructive migrations without backup; use `prisma migrate deploy` only

---

## 8. Security hardening (before public launch)

- Change admin password from seed default
- Rate limiting via Redis (pending)
- HTTPS everywhere (Vercel/Railway provide this)
- Review Cloudinary upload presets (restrict file types)
- Enable Railway/Vercel environment isolation (staging vs production)
