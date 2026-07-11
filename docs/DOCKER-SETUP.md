# Revyu — Docker Setup

---

## What Docker is used for

Revyu uses Docker **only for PostgreSQL** in local development. The API and web apps run directly with Node.js (not containerized yet).

---

## Quick start

```bash
cd c:\Users\USER\Desktop\revyu
docker compose up -d
```

This starts PostgreSQL 16 on port `5432` with:

| Setting | Value |
|---|---|
| User | `postgres` |
| Password | `password` |
| Database | `revyu` |
| Port | `5432` |

Matches default `DATABASE_URL` in `apps/api/.env.example`.

---

## Common commands

```bash
# Start database
docker compose up -d

# Stop database (keeps data)
docker compose stop

# Stop and remove container (keeps volume/data)
docker compose down

# Stop and DELETE all data
docker compose down -v

# View logs
docker compose logs -f postgres

# Check status
docker compose ps
```

---

## After starting Docker

```bash
cd apps/api
npx prisma migrate dev --name init
npm run prisma:seed
```

---

## Connect with external tools

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `revyu` |
| User | `postgres` |
| Password | `password` |

Or use Prisma Studio:
```bash
cd apps/api && npm run prisma:studio
```

---

## docker-compose.yml reference

Located at project root: `revyu/docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: revyu
    volumes:
      - revyu_pg_data:/var/lib/postgresql/data
```

Data persists in Docker volume `revyu_pg_data` across restarts.

---

## Production note

For production, use a managed PostgreSQL service (Railway, AWS RDS, Supabase, Neon) — not this local Docker setup.
