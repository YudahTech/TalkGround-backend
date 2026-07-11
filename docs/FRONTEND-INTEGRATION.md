# Revyu — Frontend Integration Guide

**Audience:** Frontend developers (separate repo)  
**Backend owner:** API team  
**Last updated:** July 2026

---

## 1. Quick start

| Item | Value |
|------|--------|
| **API base URL (local)** | `http://localhost:3001/api/v1` |
| **Swagger UI (interactive)** | `http://localhost:3001/docs` |
| **OpenAPI JSON** | `http://localhost:3001/docs/openapi.json` |
| **Auth** | `Authorization: Bearer <accessToken>` |
| **Content-Type** | `application/json` |

### Frontend env

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

CORS: backend `CORS_ORIGIN` must match your frontend origin (default `http://localhost:3000`).

---

## 2. Recommended workflow

1. **Read this doc** for auth, errors, and screen → endpoint mapping.
2. **Use Swagger** at `/docs` to try endpoints and copy request shapes.
3. **Reference** `API-SPECIFICATION.md` for detailed response examples.
4. **Reference** `DESIGN-BACKEND-MAPPING.md` for UI screen mapping.

### Generate TypeScript types (optional)

```bash
npx openapi-typescript http://localhost:3001/docs/openapi.json -o src/lib/api-schema.ts
```

---

## 3. Response conventions

### Success

```json
{ "data": { ... } }
```

Paginated lists:

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "limit": 9, "total": 42, "totalPages": 5, "showing": 9 }
}
```

### Error

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed"
  }
}
```

| Status | Meaning | Frontend action |
|--------|---------|-----------------|
| 400 | Invalid body/query | Show `error.message` |
| 401 | Not logged in / bad token | Clear token → redirect `/login` |
| 403 | Forbidden (role or not verified) | Show message; phone verify flow if needed |
| 404 | Not found | Empty state |
| 409 | Conflict (duplicate email/review) | Show message |
| 503 | Service unavailable (e.g. Cloudinary off) | Disable upload UI |

---

## 4. Authentication

### Register

```http
POST /auth/register
```

```json
{
  "email": "user@example.com",
  "password": "securePass123",
  "displayName": "Ada O.",
  "username": "ada_o",
  "phone": "+2348012345678"
}
```

**Response:** `{ data: { accessToken, refreshToken, user, message } }`

### Login

```http
POST /auth/login
```

```json
{ "email": "user@example.com", "password": "securePass123" }
```

### Store token

```typescript
localStorage.setItem('revyu_token', data.accessToken);
```

### Attach to requests

```typescript
headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
}
```

### Phone verification (optional for now)

OTP endpoints still exist (`/auth/verify-phone/*`) for later Termii setup.

**v1 access model:** a valid JWT is enough for normal user actions (write review, helpful vote, dashboard, profile). Phone/email verification is **not** enforced.

Admin routes still require `role: ADMIN`.

### Test accounts (after `npm run db:seed`)

| Role | Email | Password |
|------|-------|----------|
| Demo user | `chinedu.okafor@gmail.com` | `demo1234` |
| Admin | `admin@revyu.ng` | `admin123` |

Demo user is already phone-verified and can write reviews immediately.

---

## 5. Public vs protected routes

| Access | Routes |
|--------|--------|
| **Public** | `GET /home`, `GET /brands*`, `GET /brands/:slug/reviews`, `GET /users/:username`, `POST /auth/register`, `POST /auth/login`, `POST /reviews/:id/view` |
| **Optional JWT** | `GET /brands/:slug/reviews` — if token sent, each review includes `helpfulByMe` |
| **JWT required** | `POST /reviews`, `GET /users/me/*`, `PATCH /users/me`, `POST /uploads/signature`, `POST /reviews/:id/helpful`, brand context |
| **Admin JWT** | All `/admin/*`, `GET /waitlist/stats` |

**UX rule:** Browse brands and reviews **without** login. Prompt login for write review, dashboard, profile, helpful vote. **Do not** block review submit on phone OTP in v1.

---

## Access model (v1 — for frontend)

| Who | Can do |
|-----|--------|
| Guest (no token) | Home, explore brands, brand detail, read reviews, public profile, register/login |
| Logged-in USER | Everything guest can + write/edit/delete own reviews, helpful, report, dashboard, profile, suggest brand |
| ADMIN | Everything above + `/admin/*` moderation |

OTP / email verification screens can be built later; they are **not** required for the current API.

---

## 6. Screen → API mapping

### Landing page

| UI section | Endpoint |
|------------|----------|
| Hero | `GET /home` → `data.hero` |
| Category chips | `data.categories` + `?category=restaurants\|hotels` |
| Find trusted brands cards | `data.trustedBrandCards` |
| Popular sectors grid | `data.sectorBrands` (`?sectorLimit=4`) |
| Top rated this week | `data.topRatedThisWeek` |
| Search | `GET /home?q=...` or navigate to `/brands?q=...` |

### Explore / brands page

| UI | Endpoint |
|----|----------|
| Sidebar filters + counts | `GET /brands/filters` |
| Brand grid | `GET /brands?q=&city=&category=&minRating=&sort=&page=&limit=` |
| Card click | Navigate to `/brands/:slug` → `GET /brands/:slug` |

### Brand detail

| UI | Endpoint |
|----|----------|
| Header, trust score, rating bars | `GET /brands/:slug` |
| Reviews list | `GET /brands/:slug/reviews?sort=recent&page=1` |
| Write review button | `GET /brands/:slug/context` (JWT) → `userHasReviewed` |

### Submit review

| Step | Endpoint |
|------|----------|
| Load brand | `GET /brands/:slug` |
| Submit | `POST /reviews` with `brandId`, `rating`, `title`, `body`, `pros`, `cons`, `recommend` |
| Photos (optional) | See upload flow below |

### Dashboard

| UI | Endpoint |
|----|----------|
| Stats | `GET /users/me/dashboard` → `data.stats` |
| Recent reviews | `data.recentReviews` |

### Profile settings

| UI | Endpoint |
|----|----------|
| Load | `GET /users/me` |
| Save | `PATCH /users/me` |

---

## 7. Cloudinary upload flow

**Early dev:** Skip photos — text reviews work without Cloudinary.

When ready:

1. `POST /uploads/signature` + JWT  
   Body: `{ "folder": "reviews" | "receipts" | "brands" }`

2. Response:
   ```json
   {
     "data": {
       "cloudName": "...",
       "apiKey": "...",
       "timestamp": 1234567890,
       "signature": "...",
       "folder": "revyu/reviews"
     }
   }
   ```

3. Upload file **from browser** to Cloudinary (multipart form).

4. Attach URL to review:
   ```http
   POST /reviews/:id/media
   { "url": "https://res.cloudinary.com/.../image.jpg", "type": "photo" }
   ```

5. Avatar: `PATCH /users/me` with `{ "avatarUrl": "https://..." }`

---

## 8. Sample API client

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json?.error?.message ?? 'Request failed');
  }
  return json as T;
}
```

---

## 9. Product scope (v1)

- **Categories:** Restaurants (Dining) and Hotels only
- **Cities:** Lagos and Abuja only
- **Enums:** Use lowercase in query strings (`lagos`, `restaurants`) — API transforms to DB enums

---

## 10. What is NOT required for v1 frontend

| Feature | Status |
|---------|--------|
| Termii SMS | Optional later — **not required** to write reviews in v1 |
| Cloudinary | Optional — text-only reviews |
| Resend email | Not implemented — forgot-password is placeholder |
| Review comments | Not in API — use `helpfulCount` only |
| Refresh token flow | `refreshToken` equals `accessToken` for now |

---

## 11. Backend contact / changes

- Breaking API changes: bump version or notify frontend via changelog
- Staging URL: TBD — update `NEXT_PUBLIC_API_URL` per environment
- Questions: refer to Swagger + `API-SPECIFICATION.md`

---

## 12. Swagger quick guide

1. Start API: `npm run dev:api`
2. Open `http://localhost:3001/docs`
3. Call `POST /auth/login` → copy `accessToken` from response `data`
4. Click **Authorize** → paste token only (no `Bearer ` prefix)
5. Try protected endpoints

Export spec for codegen:

```bash
curl http://localhost:3001/docs/openapi.json -o openapi.json
```
