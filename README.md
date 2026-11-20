# TalkGround Backend

NestJS + Prisma + PostgreSQL API for **TalkGround** — trusted reviews for restaurants and hotels in Lagos & Abuja.

## For frontend developers

| Resource | Link (after clone / when API is running) |
|----------|------------------------------------------|
| **Integration guide (start here)** | [`docs/FRONTEND-INTEGRATION.md`](./docs/FRONTEND-INTEGRATION.md) |
| **API testing guide** | [`docs/API-TESTING-GUIDE.md`](./docs/API-TESTING-GUIDE.md) |
| **Full API contract** | [`docs/API-SPECIFICATION.md`](./docs/API-SPECIFICATION.md) |
| **Screen → endpoint map** | [`docs/DESIGN-BACKEND-MAPPING.md`](./docs/DESIGN-BACKEND-MAPPING.md) |
| **Swagger (interactive)** | `http://localhost:3001/docs` when API is running locally |
| **OpenAPI JSON** | `http://localhost:3001/docs/openapi.json` |

> **Swagger is not on GitHub itself.** It appears when the Nest API is running. After staging deploy, the frontend gets: `https://YOUR-API-HOST/docs`

## Quick start (backend)

```bash
# 1. Database
docker compose up -d

# 2. Install
npm install

# 3. Env
copy apps\api\.env.example apps\api\.env

# 4. Migrate + seed
npm run db:migrate
npm run db:seed

# 5. Run API
npm run dev:api
```

- API: `http://localhost:3001/api/v1`
- Swagger: `http://localhost:3001/docs`

### Test accounts (after seed)

| Email | Password | Role |
|-------|----------|------|
| `a seeded demo account` | <demo password, shared privately> | USER |

## Access model (v1)

- **Guest:** browse home, brands, reviews
- **Logged-in USER:** write reviews, dashboard, profile (JWT only — no phone OTP required yet)
- **ADMIN:** `/admin/*` moderation

## Docs index

See [`docs/DOCUMENTATION-INDEX.md`](./docs/DOCUMENTATION-INDEX.md)
