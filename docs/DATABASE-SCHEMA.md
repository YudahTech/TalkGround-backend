# TalkGround — Database Schema Reference

> **Outdated (v1).** API v2.0 replaced this document's endpoints and data model. Use
> [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md) and [API-CHANGELOG-v2.md](./API-CHANGELOG-v2.md).

**ORM:** Prisma 5  
**Database:** PostgreSQL 16  
**Schema file:** `apps/api/prisma/schema.prisma`

---

## Entity relationship overview

```
User ──────┬──── Review ──────┬──── ReviewMedia
           │                  ├──── ReviewFlag
           │                  └──── ReviewReport
           ├──── BrandSuggestion
           └──── OtpCode

Brand ──────── Review

SurveyResponse (standalone)
WaitlistEntry (standalone)
```

---

## Tables

### User

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| email | String | Unique |
| passwordHash | String | bcrypt |
| displayName | String | Shown on reviews |
| username | String | Unique, URL slug `/u/{username}` |
| phone | String? | For OTP |
| emailVerified | Boolean | Required before review |
| phoneVerified | Boolean | Required before review |
| role | Enum | `USER` \| `ADMIN` |
| suspended | Boolean | Admin ban |
| suspendedReason | String? | |

### Brand

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | String | |
| slug | String | Unique, URL `/brand/{slug}` |
| description | String? | |
| logoUrl | String? | Cloudinary URL |
| website | String? | |
| category | Enum | `RESTAURANTS` \| `HOTELS` |
| subType | String? | e.g. BUKA, HOTEL, SHORT_LET |
| city | Enum | `LAGOS` \| `ABUJA` |
| area | String | e.g. Lekki, Garki |
| status | Enum | `ACTIVE` \| `INACTIVE` |

### Review

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| brandId | UUID | FK → Brand |
| userId | UUID | FK → User |
| rating | Int | 1–5 |
| title | String | Max ~100 chars |
| body | String | Min 50 chars |
| pros | String? | |
| cons | String? | |
| recommend | Boolean | |
| status | Enum | See below |
| verifiedVisit | Boolean | Admin-approved receipt |
| ipHash | String? | Salted SHA-256 |
| textHash | String? | Normalized body hash |
| **Unique** | brandId + userId | One review per user per brand |

**ReviewStatus enum:**
- `PUBLISHED` — live
- `PENDING_VERIFICATION` — receipt awaiting admin
- `FLAGGED` — auto-flagged, needs admin review
- `SUSPENDED` — hidden by admin
- `REMOVED` — soft-deleted

### ReviewMedia

| Column | Type | Notes |
|---|---|---|
| reviewId | UUID | FK |
| type | Enum | `PHOTO` \| `RECEIPT` |
| url | String | Cloudinary URL |

Max 3 photos + 1 receipt per review (enforced in service).

### ReviewFlag

| Column | Type | Notes |
|---|---|---|
| reviewId | UUID | FK |
| type | Enum | `IP_MATCH`, `DUPLICATE_TEXT`, `VELOCITY`, `NEW_ACCOUNT_LOW_RATING`, `MANUAL` |
| metadata | JSON? | e.g. `{ count: 3 }` |

### ReviewReport

| Column | Type | Notes |
|---|---|---|
| reviewId | UUID | FK |
| reporterId | UUID | FK → User |
| reason | Enum | `FAKE_SPAM`, `NEVER_VISITED`, `OFFENSIVE`, `PAID_INCENTIVIZED`, `OTHER` |
| status | Enum | `OPEN`, `DISMISSED`, `ACTIONED` |

### BrandSuggestion

User-submitted brands awaiting admin approval.

| Column | Type | Notes |
|---|---|---|
| userId | UUID | Who suggested |
| name, category, city, area | | |
| status | Enum | `PENDING`, `APPROVED`, `REJECTED` |

### SurveyResponse

| Column | Type | Notes |
|---|---|---|
| answers | JSON | All survey answers keyed by question ID |
| email | String? | Optional opt-in |
| city | String? | |

### WaitlistEntry

| Column | Type | Notes |
|---|---|---|
| email | String | Unique |
| fullName | String | |
| city | Enum | `LAGOS` \| `ABUJA` |
| primaryUse | Enum | `RESTAURANTS`, `HOTELS`, `BOTH`, `WRITE_REVIEWS` |
| invitedAt | DateTime? | Launch wave tracking |
| registeredAt | DateTime? | Converted to user |

### OtpCode

| Column | Type | Notes |
|---|---|---|
| userId | UUID | |
| code | String | 6 digits |
| expiresAt | DateTime | 10 minutes |
| used | Boolean | |

---

## Common Prisma commands

```bash
# Generate client after schema change
npx prisma generate

# Create migration
npx prisma migrate dev --name add_something

# Reset database (DESTRUCTIVE)
npx prisma migrate reset

# Visual browser
npx prisma studio

# Seed
npm run prisma:seed
```

---

## Indexes and constraints

| Constraint | Table | Purpose |
|---|---|---|
| Unique email | User | One account per email |
| Unique username | User | Profile URLs |
| Unique slug | Brand | Brand URLs |
| Unique brandId+userId | Review | One review rule |
| Unique email | WaitlistEntry | No duplicate signups |

---

## Privacy / NDPR notes

- Raw IP addresses are **never stored** — only salted hash
- Receipt URLs exist in DB but are **not exposed** in public API
- Phone numbers are **never returned** in public user profiles
- Waitlist and survey data stored separately; linked by email only when both exist
