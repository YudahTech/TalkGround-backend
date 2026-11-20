# Refresher Course: NestJS, PostgreSQL, Prisma & Docker

**Built for the TalkGround project** — every concept maps to real code in `c:\Users\USER\Desktop\TalkGround-backend`

**Estimated time:** 12–16 hours (self-paced)  
**Level:** Intermediate refresh (you've touched these before; this reconnects theory to practice)

---

## How to use this course

1. Read each module in order (Docker → Postgres → Prisma → NestJS)
2. After each lesson, open the referenced TalkGround file and read the actual code
3. Complete the **Exercise** before moving on
4. Use the **Cheat sheet** at the end for daily reference

---

# Module 1: Docker (2 hours)

## 1.1 What is Docker?

Docker packages software into **containers** — lightweight, isolated environments that run the same everywhere.

| Concept | Analogy |
|---|---|
| **Image** | Recipe (blueprint) |
| **Container** | Running instance of the recipe |
| **Volume** | Persistent storage (survives container restart) |
| **docker-compose** | Run multiple containers with one command |

**In TalkGround:** We use Docker only for PostgreSQL. API and web run with Node directly.

**File:** `talkground/docker-compose.yml`

---

## 1.2 Essential commands

```bash
docker compose up -d        # Start containers in background
docker compose ps           # List running containers
docker compose logs -f      # Follow logs
docker compose stop         # Stop (keeps data)
docker compose down         # Remove containers (keeps volumes)
docker compose down -v      # Remove containers AND data (destructive)
```

---

## 1.3 Reading TalkGround's docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine    # Which image to pull
    ports:
      - "5432:5432"              # host:container port mapping
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: talkground
    volumes:
      - talkground_pg_data:/var/lib/postgresql/data   # Persist data
```

**Key insight:** When you `docker compose down` without `-v`, your database data survives. When you `down -v`, everything is wiped.

---

## 1.4 Exercise

1. Run `docker compose up -d` in `talkground/`
2. Run `docker compose ps` — confirm postgres is "running"
3. Connect with `npx prisma studio` from `apps/api`
4. Run `docker compose stop` then `docker compose up -d` — confirm data still there

---

## 1.5 Common mistakes

| Mistake | Fix |
|---|---|
| Port 5432 already in use | Stop local PostgreSQL or change port in compose file |
| "Cannot connect to Docker daemon" | Start Docker Desktop |
| Data disappeared | You ran `docker compose down -v` |

---

# Module 2: PostgreSQL (2 hours)

## 2.1 What is PostgreSQL?

A **relational database** — data lives in tables with rows and columns, connected by relationships.

| Concept | Description |
|---|---|
| **Table** | Collection of rows (like a spreadsheet) |
| **Row** | One record (one user, one review) |
| **Column** | One field (email, rating) |
| **Primary key (PK)** | Unique identifier per row |
| **Foreign key (FK)** | Links to another table's PK |
| **Index** | Speeds up lookups |
| **Enum** | Fixed set of allowed values |
| **JSON column** | Store flexible structured data |

---

## 2.2 SQL you'll actually use

```sql
-- Create database (once)
CREATE DATABASE talkground;

-- Basic queries
SELECT * FROM "User" WHERE email = 'the staff account created with `npm run admin:create`';
SELECT * FROM "Brand" WHERE city = 'LAGOS' AND status = 'ACTIVE';

-- Join (reviews with brand names)
SELECT r.title, r.rating, b.name
FROM "Review" r
JOIN "Brand" b ON r."brandId" = b.id
WHERE r.status = 'PUBLISHED';

-- Count
SELECT COUNT(*) FROM "Review" WHERE "brandId" = 'some-uuid';

-- Insert (Prisma does this for you, but good to know)
INSERT INTO "Brand" (id, name, slug, category, city, area, status)
VALUES (gen_random_uuid(), 'Test Spot', 'test-spot', 'RESTAURANTS', 'LAGOS', 'Yaba', 'ACTIVE');
```

**Note:** Prisma uses quoted table names matching model names (`"User"`, `"Brand"`).

---

## 2.3 TalkGround data model (simplified)

```
User (1) ──── writes ──── (N) Review (N) ──── about ──── (1) Brand
```

- One user writes many reviews
- One brand has many reviews
- **Unique constraint:** one user can only review a brand once

See full reference: `docs/DATABASE-SCHEMA.md`

---

## 2.4 Exercise

1. Start Docker postgres
2. Run `npx prisma studio` from `apps/api`
3. Browse User, Brand, Review tables
4. Find the admin user and 4 seeded brands
5. Try this in Prisma Studio: create a test brand, then delete it

---

## 2.5 PostgreSQL vs Prisma

| PostgreSQL | Prisma |
|---|---|
| The actual database engine | The tool your Node code uses to talk to PostgreSQL |
| Stores the data | Generates TypeScript types and query methods |
| You *can* write raw SQL | You write `prisma.user.findMany()` instead |

**Rule:** In TalkGround, always use Prisma in application code. Use raw SQL only for debugging in Prisma Studio or psql.

---

# Module 3: Prisma (3 hours)

## 3.1 The three Prisma files

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Define models, fields, relationships |
| `prisma/migrations/` | SQL history of schema changes |
| `prisma/seed.ts` | Initial data (admin user, sample brands) |

**TalkGround schema:** `apps/api/prisma/schema.prisma`

---

## 3.2 Schema language basics

```prisma
model User {
  id        String   @id @default(uuid())    // Primary key, auto UUID
  email     String   @unique                 // No duplicates
  role      UserRole @default(USER)          // Enum with default
  reviews   Review[]                         // One-to-many relation
  createdAt DateTime @default(now())
}

model Review {
  id      String @id @default(uuid())
  brandId String
  userId  String
  rating  Int
  brand   Brand  @relation(fields: [brandId], references: [id])
  user    User   @relation(fields: [userId], references: [id])

  @@unique([brandId, userId])   // Composite unique: one review per user per brand
}
```

**Decorators you'll see:**
- `@id` — primary key
- `@unique` — no duplicates
- `@default()` — default value
- `@relation` — foreign key link
- `@@unique([a, b])` — composite constraint

---

## 3.3 Prisma workflow (memorise this)

```
1. Edit schema.prisma
2. npx prisma migrate dev --name describe_change
3. npx prisma generate          (auto-runs with migrate dev)
4. Use new types in your code
```

**Never** edit the database manually without updating the schema — Prisma and DB will drift apart.

---

## 3.4 Prisma Client in code

**Service setup** (`apps/api/src/prisma/prisma.service.ts`):

```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

**Common queries in TalkGround:**

```typescript
// Find one
const user = await this.prisma.user.findUnique({
  where: { email: 'the staff account created with `npm run admin:create`' },
});

// Find many with filter
const brands = await this.prisma.brand.findMany({
  where: { city: 'LAGOS', status: 'ACTIVE' },
  orderBy: { createdAt: 'desc' },
  skip: 0,
  take: 20,
});

// Create
const review = await this.prisma.review.create({
  data: {
    brandId, userId, rating, title, body, recommend,
  },
  include: { user: true, brand: true },  // Join related data
});

// Update
await this.prisma.review.update({
  where: { id },
  data: { status: 'SUSPENDED' },
});

// Upsert (create or update)
await this.prisma.user.upsert({
  where: { email: 'the staff account created with `npm run admin:create`' },
  update: {},
  create: { email: '...', passwordHash: '...', ... },
});

// Count
const total = await this.prisma.review.count({
  where: { brandId, status: 'PUBLISHED' },
});

// Transaction (all or nothing)
await this.prisma.$transaction([
  this.prisma.review.update({ ... }),
  this.prisma.reviewFlag.create({ ... }),
]);
```

---

## 3.5 Reading TalkGround examples

| Feature | File to study |
|---|---|
| User registration | `apps/api/src/auth/auth.service.ts` → `prisma.user.create` |
| Brand listing | `apps/api/src/brands/brands.service.ts` → `prisma.brand.findMany` |
| Review + unique constraint | `apps/api/src/reviews/reviews.service.ts` → `prisma.review.create` |
| Trust flags | `apps/api/src/reviews/reviews.service.ts` → `prisma.reviewFlag.create` |
| Survey JSON storage | `apps/api/src/growth/growth.service.ts` → `answers: Json` |
| Seed script | `apps/api/prisma/seed.ts` |

---

## 3.6 Exercise

1. Add a optional `tagline` field to the `Brand` model in `schema.prisma`:
   ```prisma
   tagline String?
   ```
2. Run `npx prisma migrate dev --name add_brand_tagline`
3. Open Prisma Studio — confirm column exists
4. Add a tagline to one brand in Studio
5. Update `brands.service.ts` to return `tagline` in the response (optional stretch)

---

## 3.7 Prisma cheat commands

```bash
npx prisma studio              # Visual DB browser
npx prisma migrate dev         # Dev: create + apply migration
npx prisma migrate deploy      # Production: apply pending migrations
npx prisma migrate reset       # Wipe DB + re-run all migrations + seed
npx prisma generate            # Regenerate TypeScript client
npx prisma db pull             # Pull schema from existing DB (introspect)
npx prisma format              # Format schema file
```

---

# Module 4: NestJS (5 hours)

## 4.1 What is NestJS?

A **Node.js framework** for building APIs. Think of it as organised Express with:

- **Modules** — group related features
- **Controllers** — handle HTTP routes
- **Services** — business logic
- **Guards** — authentication/authorization
- **Pipes** — validation
- **Filters** — error handling
- **Dependency Injection** — automatic wiring

**TalkGround API entry:** `apps/api/src/main.ts`

---

## 4.2 Request lifecycle

```
HTTP Request
    │
    ▼
Middleware (CORS)
    │
    ▼
Guard (JwtAuthGuard — is user logged in?)
    │
    ▼
Guard (RolesGuard — is user admin?)
    │
    ▼
Pipe (ValidationPipe — is body valid?)
    │
    ▼
Controller (route handler)
    │
    ▼
Service (business logic + Prisma)
    │
    ▼
HTTP Response (JSON)
    │
    ▼
Exception Filter (if error thrown)
```

---

## 4.3 Module structure

```typescript
// brands.module.ts
@Module({
  controllers: [BrandsController],   // Routes
  providers: [BrandsService],        // Logic
  exports: [BrandsService],          // Share with other modules
})
export class BrandsModule {}
```

**TalkGround modules map:**

| Module | Responsibility |
|---|---|
| `AuthModule` | Register, login, JWT, SMS OTP |
| `BrandsModule` | Public brand endpoints |
| `ReviewsModule` | Review CRUD + trust |
| `GrowthModule` | Survey + waitlist |
| `UsersModule` | Profiles |
| `AdminModule` | Admin operations |
| `UploadsModule` | Cloudinary signatures |
| `PrismaModule` | Database (global) |

**Root:** `apps/api/src/app.module.ts` imports all modules.

---

## 4.4 Controllers — HTTP routes

```typescript
@Controller('brands')                    // Base path: /api/v1/brands
export class BrandsController {
  constructor(private brands: BrandsService) {}  // DI injection

  @Public()                               // Skip JWT guard
  @Get()                                  // GET /api/v1/brands
  findAll(@Query() query: BrandQueryDto) {
    return this.brands.findAll(query);
  }

  @Public()
  @Get(':slug')                           // GET /api/v1/brands/:slug
  findOne(@Param('slug') slug: string) {
    return this.brands.findBySlug(slug);
  }
}
```

**Decorators cheat sheet:**

| Decorator | Purpose |
|---|---|
| `@Get()`, `@Post()`, `@Patch()`, `@Delete()` | HTTP method + route |
| `@Param('id')` | URL parameter |
| `@Query()` | Query string `?page=1` |
| `@Body()` | Request body JSON |
| `@CurrentUser()` | Logged-in user (custom) |
| `@Public()` | Skip authentication |
| `@Roles(UserRole.ADMIN)` | Admin only |

---

## 4.5 Services — business logic

Controllers should be **thin**. All logic goes in services.

```typescript
@Injectable()
export class BrandsService {
  constructor(private prisma: PrismaService) {}  // Injected by NestJS

  async findBySlug(slug: string) {
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand) throw new NotFoundException('Brand not found');
    return { data: brand };
  }
}
```

**Rule:** Controllers call services. Services call Prisma. Never put Prisma queries directly in controllers.

---

## 4.6 DTOs and validation

```typescript
// brands.dto.ts
export class CreateReviewDto {
  @IsString()
  brandId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @MinLength(50)
  body: string;
}
```

Enabled globally in `main.ts`:

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,        // Strip unknown fields
  transform: true,        // Auto-transform types
  forbidNonWhitelisted: true,
}));
```

If validation fails → automatic 400 response.

---

## 4.7 Authentication (JWT)

**Flow:**
1. User logs in → API returns JWT token
2. Client stores token → sends `Authorization: Bearer <token>` on every request
3. `JwtAuthGuard` validates token → attaches user to request
4. `@CurrentUser()` decorator reads user in controller

**Key files:**
- `apps/api/src/auth/jwt.strategy.ts` — validates token, loads user from DB
- `apps/api/src/auth/jwt-auth.guard.ts` — blocks unauthenticated requests
- `apps/api/src/auth/roles.guard.ts` — blocks non-admin from admin routes

---

## 4.8 Error handling

```typescript
// In services — throw NestJS exceptions
throw new NotFoundException('Brand not found');
throw new ConflictException('Email already taken');
throw new ForbiddenException('Not your review');
throw new BadRequestException('Review too short');

// GlobalExceptionFilter formats all errors as:
// { "error": { "code": "NOT_FOUND", "message": "Brand not found" } }
```

**File:** `apps/api/src/common/filters/global-exception.filter.ts`

---

## 4.9 Dependency injection — how NestJS wires everything

```typescript
// You DON'T do this:
const prisma = new PrismaService();
const brands = new BrandsService(prisma);

// NestJS does it automatically:
@Module({
  providers: [BrandsService],     // NestJS creates instance
  controllers: [BrandsController], // NestJS injects BrandsService into constructor
})
```

`PrismaModule` is `@Global()` — PrismaService available everywhere without importing.

---

## 4.10 Exercise — add a health check endpoint

1. Create `apps/api/src/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { data: { status: 'ok', timestamp: new Date().toISOString() } };
  }
}
```

2. Create `apps/api/src/health/health.module.ts` and import in `app.module.ts`
3. Restart API → visit http://localhost:3001/api/v1/health
4. Should return `{ "data": { "status": "ok", ... } }`

---

## 4.11 Reading order for TalkGround API

Study these files in this order:

```
1. main.ts                    — Bootstrap
2. app.module.ts              — Module wiring
3. prisma/prisma.service.ts   — Database connection
4. common/decorators.ts       — @Public(), @Roles()
5. auth/auth.controller.ts    — Simple POST routes
6. auth/auth.service.ts        — Business logic + bcrypt
7. auth/jwt.strategy.ts        — How JWT validation works
8. brands/brands.service.ts    — Prisma queries + mapping
9. reviews/reviews.service.ts  — Complex logic + trust checks
10. admin/admin.service.ts     — Admin operations
```

---

# Module 5: How it all connects in TalkGround (2 hours)

## 5.1 Full stack flow: User writes a review

```
1. [Browser] User fills form at /review/jollof-palace
2. [Next.js]  uploadToCloudinary() → POST /uploads/signature → gets signed params
3. [Browser]  Uploads image directly to Cloudinary
4. [Next.js]  POST /api/v1/reviews { brandId, rating, title, body, ... }
5. [NestJS]   JwtAuthGuard validates token
6. [NestJS]   ValidationPipe validates body
7. [NestJS]   ReviewsController → ReviewsService.create()
8. [NestJS]   Check phone verified, rate limit, duplicate review
9. [Prisma]   prisma.review.create({ data: { ... } })
10. [Prisma]  prisma.reviewFlag.create() if trust checks fail
11. [NestJS]  Return { data: review }
12. [Next.js] POST /reviews/:id/media { url, type: 'photo' }
13. [Browser] Redirect to /brand/jollof-palace
```

---

## 5.2 Environment variables flow

```
apps/api/.env
  DATABASE_URL ──────► PrismaService ──────► PostgreSQL (Docker)
  JWT_SECRET ────────► JwtModule ──────────► Token sign/verify
  CLOUDINARY_* ──────► UploadsService ──────► Signed upload params
  TERMII_* ──────────► SmsService ──────────► OTP SMS

apps/web/.env.local
  NEXT_PUBLIC_API_URL ► lib/api.ts ─────────► All API calls
```

---

## 5.3 Final exercise — end-to-end

Do this complete flow without looking at docs:

1. `docker compose up -d`
2. `npx prisma migrate dev` (if not done)
3. `npm run prisma:seed`
4. Start API + Web
5. Register a new user
6. Send + confirm phone OTP
7. Write a review with a photo
8. Log in as admin
9. Approve the review in moderation queue (if flagged)
10. Verify review appears on brand page

If you complete this, you understand the full stack.

---

# Cheat Sheet (print this)

## Docker
```bash
docker compose up -d          # Start
docker compose down           # Stop
docker compose logs -f        # Logs
```

## Prisma
```bash
npx prisma migrate dev --name x   # Schema change
npx prisma studio               # GUI
npx prisma generate             # Regen client
npm run prisma:seed             # Seed data
```

## NestJS patterns
```typescript
@Controller('path')    // Route group
@Get(':id')            // GET with param
@Post()                // POST
@Body() dto: MyDto      // Request body
@Query() q: MyQuery     // Query params
@Param('id') id: string // URL param
@Injectable()           // Service
@Module({ ... })        // Module
@Public()               // No auth
@Roles(ADMIN)           // Admin only
throw new NotFoundException('msg')
```

## Prisma queries
```typescript
findUnique({ where: { id } })
findMany({ where, orderBy, skip, take })
create({ data })
update({ where, data })
delete({ where })
count({ where })
upsert({ where, update, create })
```

## PostgreSQL types in Prisma
```
String → VARCHAR/TEXT
Int → INTEGER
Boolean → BOOLEAN
DateTime → TIMESTAMP
Json → JSONB
Enum → PostgreSQL ENUM
@default(uuid()) → UUID
```

---

# What's next after this course

| Topic | When to learn |
|---|---|
| Redis caching | When rate limiting goes to production |
| BullMQ job queues | When you need background email/notifications |
| E2E testing (Jest + Supertest) | Before launch (see ACCEPTANCE-TEST-CHECKLIST.md) |
| GitHub Actions CI/CD | Before deployment (see DEPLOYMENT-GUIDE.md) |
| Next.js Server Components deep dive | When optimising SEO/performance |

---

**Course complete.** You now have the foundation to work on every part of TalkGround. Open `docs/GETTING-STARTED.md` and start building.
