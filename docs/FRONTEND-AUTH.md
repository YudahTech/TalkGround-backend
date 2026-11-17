# TalkGround — Frontend Auth Guide (HttpOnly cookies)

**Audience:** Frontend developers integrating with the TalkGround API
**API version:** 1.2 (cookie-only auth) · **Last updated:** 17 November 2026
**Base URL (live):** `https://revyu-backend.onrender.com/api/v1` · **Local:** `http://localhost:3001/api/v1`
**Swagger:** https://revyu-backend.onrender.com/docs

> **TL;DR**
> 1. Send **every** API request with `credentials: 'include'`.
> 2. Never store, read or send tokens. There is no `accessToken` in any response and no `Authorization` header.
> 3. On app load, call `GET /users/me`: `200` = logged in, `401` = try `POST /auth/refresh` once, still `401` = guest.
> 4. On any `401` from a protected call: `POST /auth/refresh` once (shared between parallel calls), then retry.

---

## 1. What changed (vs. v1.1)

| Before (v1.1) | Now (v1.2) |
|---|---|
| Login/register/refresh returned `accessToken` + `refreshToken` in JSON | **Removed.** Tokens exist only in HttpOnly cookies |
| `Authorization: Bearer <token>` accepted | **Ignored.** A Bearer-only request is treated as logged out (`401` on protected routes) |
| `POST /auth/refresh` body `{ refreshToken }` | **No body.** Reads the cookie |
| `POST /auth/logout` body `{ refreshToken?, allDevices? }` | Body `{ allDevices? }` only |
| Swagger: copy token → **Authorize** | Swagger: just run `POST /auth/login` on the page; the browser keeps the cookie |

If you already wrote Bearer code against v1.1: delete the token storage, delete the `Authorization` header, add `credentials: 'include'`.

---

## 2. How the session works

The API sets two cookies. JavaScript cannot read either one (`HttpOnly`), which is the point: an XSS bug can't steal the session.

| Cookie | Contains | Path | Lifetime | Sent on |
|---|---|---|---|---|
| `talkground_at` | Access JWT | `/` | `expiresIn` seconds (15 min recommended; currently 7 days on Render) | Every API request |
| `talkground_rt` | Refresh token (single-use, rotates) | `/api/v1/auth` | 30 days (`refreshTokenExpiresAt`) | Only `/auth/*` calls |

```
Browser                                  API
  │ POST /auth/login {email,password}     │
  │──────────────────────────────────────▶│  verify password
  │◀──────────────────────────────────────│  Set-Cookie: talkground_at, talkground_rt
  │  { data: { user, expiresIn, ... } }   │
  │                                       │
  │ GET /users/me   (cookie auto-sent)    │
  │──────────────────────────────────────▶│  200
  │                                       │
  │   ... access cookie expires ...       │
  │ GET /users/me                         │
  │──────────────────────────────────────▶│  401
  │ POST /auth/refresh  (no body)         │
  │──────────────────────────────────────▶│  rotate refresh token
  │◀──────────────────────────────────────│  Set-Cookie: new talkground_at + talkground_rt
  │ GET /users/me   (retry)               │
  │──────────────────────────────────────▶│  200
```

---

## 3. Auth endpoints

All bodies are JSON. All responses are wrapped as `{ "data": ... }`; errors as `{ "error": { "code", "message" } }`.

| Method | Path | Auth | Body | Sets cookies | Returns `data` |
|---|---|---|---|---|---|
| `POST` | `/auth/register` | Public | `{ email, password, displayName, username, phone? }` | ✅ | `{ user, expiresIn, refreshTokenExpiresAt, message, devEmailCode? }` |
| `POST` | `/auth/login` | Public | `{ email, password }` | ✅ | `{ user, expiresIn, refreshTokenExpiresAt }` |
| `POST` | `/auth/refresh` | `talkground_rt` cookie | none | ✅ (or clears both on 401) | `{ user, expiresIn, refreshTokenExpiresAt }` |
| `POST` | `/auth/logout` | optional | `{ allDevices?: boolean }` | clears both | `{ message: "Logged out" }` |
| `POST` | `/auth/change-password` | cookie | `{ currentPassword, newPassword }` | ✅ (new session) | `{ user, expiresIn, refreshTokenExpiresAt, message }` |
| `POST` | `/auth/forgot-password` | Public | `{ email }` | – | `{ message }` (same reply whether or not the email exists) |
| `POST` | `/auth/reset-password` | Public | `{ token, password }` | – | `{ message }`; signs out every session |
| `POST` | `/auth/verify-email/send-code` | cookie | none | – | `{ message, devCode? }` |
| `POST` | `/auth/verify-email/confirm` | cookie | `{ otp }` (6 digits) | – | updated status |
| `POST` | `/auth/verify-phone/send-otp` | cookie | `{ phone? }` | – | `{ message, devCode? }` |
| `POST` | `/auth/verify-phone/confirm-otp` | cookie | `{ otp }` (6 digits) | – | updated status |

Exact DTO fields and validation rules are in Swagger (Schemas → `RegisterDto`, `LoginDto`, `ChangePasswordDto`, …). Sending a field that isn't in the DTO returns `400`.

**Example: login response body**

```json
{
  "data": {
    "expiresIn": 604800,
    "refreshTokenExpiresAt": "2026-12-17T13:27:44.240Z",
    "user": {
      "id": "e60d842e-4e61-46cd-af7a-b75fbe73bdfa",
      "email": "chinedu.okafor@gmail.com",
      "username": "chinedu_okafor",
      "displayName": "Chinedu Okafor",
      "role": "USER",
      "emailVerified": true,
      "phoneVerified": true,
      "phone": "+2348012345678",
      "avatarUrl": null,
      "bio": null,
      "city": "lagos"
    }
  }
}
```

Keep `user` in app state (React context / store). That's the only "session" the frontend holds.

---

## 4. Rules the frontend must follow

1. **`credentials: 'include'` on every request to the API**, including login, register, refresh and logout. Without it the browser neither stores nor sends the cookies. (axios: `withCredentials: true`.)
2. **Do not** put anything in `localStorage` / `sessionStorage` for auth. Do not send `Authorization`.
3. **Refresh only once at a time.** The refresh token is single-use. If two tabs or two parallel requests both send the same old refresh token, the second one looks like a replay attack and the API **signs the user out everywhere**. Share one in-flight refresh promise (see §5) — and across tabs, the second tab's refresh will simply get `401`; treat that as "logged out" only after re-checking `GET /users/me`.
4. **Don't send API credentials to Cloudinary.** The upload step (`POST https://api.cloudinary.com/...`) is a different server: plain `fetch` with `FormData`, no `credentials: 'include'`.
5. **Mutations must come from an allowed origin.** Any `POST/PATCH/DELETE` that carries the cookies is checked against the backend's `CORS_ORIGIN` list. A request from any other origin gets `403 "Cross-site request blocked (origin not allowed)"`. Tell the backend team every frontend URL (preview URLs included) that needs access.

---

## 5. Reference implementation (Next.js / React, TypeScript)

### 5.1 API client with automatic refresh

```ts
// src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL!; // e.g. http://localhost:3001/api/v1

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time; every caller waiting on a 401 shares the same promise. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });

  // Access cookie expired → rotate once and retry. Never retry the auth endpoints themselves.
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, init, false);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'Request failed');
  }
  return json as T;
}
```

### 5.2 Auth provider

```tsx
// src/lib/auth.tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { api, ApiError } from './api';

type User = {
  id: string; email: string; username: string; displayName: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  emailVerified: boolean; phoneVerified: boolean;
  phone: string | null; avatarUrl: string | null; bio: string | null; city: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: (allDevices?: boolean) => Promise<void>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // GET /users/me already refreshes once on 401 via api().
  async function reload() {
    try {
      const { data } = await api<{ data: User }>('/users/me');
      setUser(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else throw e;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function login(email: string, password: string) {
    const { data } = await api<{ data: { user: User } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
  }

  async function logout(allDevices = false) {
    await api('/auth/logout', { method: 'POST', body: JSON.stringify({ allDevices }) }).catch(() => {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, reload }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
```

Register works the same as login (`POST /auth/register`, then `setUser(data.user)`). After email/phone verification succeeds, call `reload()` so `emailVerified` / `phoneVerified` update.

### 5.3 Route protection

Do it client-side with `useAuth()`: while `loading` show a skeleton; if `user` is `null` redirect to `/login?next=...`. The frontend server **cannot see** the auth cookies while the API is on a different domain (they belong to the API's domain), so Next.js middleware / server components can't check auth until §6 option A with `COOKIE_DOMAIN` is in place. Fetch all user-specific data from client components.

### 5.4 Error handling

| Status | Meaning | Frontend action |
|---|---|---|
| `400` | Validation failed | Show `error.message` |
| `401` | Not logged in / session expired (after one refresh attempt) | `setUser(null)`, redirect to login |
| `403` `"Cross-site request blocked"` | Your origin isn't in `CORS_ORIGIN` | Config issue — tell the backend team the URL |
| `403` other | Wrong role, suspended, or unverified email/phone for reviews | Show message / send to verification screen |
| `429` | Rate limited, or account locked after 10 failed logins (15 min) | Show `error.message`, disable the button briefly |

---

## 6. Deployment: where the frontend and API live matters

Browsers only send cookies reliably when the frontend and API are on the **same site** (same registrable domain).

| Setup | Example | Works? |
|---|---|---|
| **Local dev** | `localhost:3000` → `localhost:3001` | ✅ All browsers. Nothing to configure. |
| **A. Custom domains (production target)** | `talkground.ng` / `app.talkground.ng` → `api.talkground.ng` | ✅ All browsers, including Safari/iPhone |
| **B. Different sites (today)** | `*.vercel.app` → `revyu-backend.onrender.com` | ⚠️ Chrome, Edge, Firefox: yes. **Safari (all iPhones) and Brave: no** — they block third-party cookies, so login appears to succeed but the next request is `401` |
| Local frontend → live Render API | `localhost:3000` → `onrender.com` | ⚠️ Same as B (works in Chrome) |

`vercel.app` and `onrender.com` are both public suffixes, so every `*.vercel.app` URL is its own site — there is no way to share cookies with `onrender.com`.

**What this means for you:**
- **Start integration now** against the local API, or against the Render API in **Chrome**.
- **Before launch** the API must move to `api.<our-domain>` and the web app to `<our-domain>` / `app.<our-domain>` (backend/devops task). No frontend code changes are needed for that switch beyond `NEXT_PUBLIC_API_URL`.
- Test on Safari only once option A is live.

---

## 7. Swagger

1. Open `/docs`.
2. Run `POST /auth/login` with the demo account below. The browser stores the cookie.
3. Every protected "Try it out" call now works. No **Authorize** step, nothing to paste.
4. `POST /auth/logout` to sign out.

Generate types: `npx openapi-typescript https://revyu-backend.onrender.com/docs/openapi.json -o src/lib/api-schema.ts`

| Role | Email | Password |
|---|---|---|
| User | `chinedu.okafor@gmail.com` | `demo1234` |
| Admin | `admin@revyu.ng` | `admin123` |

---

## 8. Testing from the command line (curl)

curl doesn't keep cookies unless you give it a jar:

```bash
API=http://localhost:3001/api/v1
curl -c jar.txt -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"email":"chinedu.okafor@gmail.com","password":"demo1234"}' $API/auth/login
curl -b jar.txt $API/users/me                                                 # 200
curl -b jar.txt -c jar.txt -H 'Origin: http://localhost:3000' -X POST $API/auth/refresh
curl -b jar.txt -c jar.txt -H 'Origin: http://localhost:3000' -X POST $API/auth/logout
```

The `Origin` header is required on `POST`s that carry cookies (see §4.5).

---

## 9. Integration checklist

- [ ] `NEXT_PUBLIC_API_URL` set; every request uses `credentials: 'include'`
- [ ] No token storage, no `Authorization` header anywhere
- [ ] App load: `GET /users/me` → user or guest
- [ ] Login / register store `data.user` in state
- [ ] 401 → single shared `POST /auth/refresh` → retry once → else logged out
- [ ] Logout calls `POST /auth/logout`, clears `user`
- [ ] After email/phone verification, re-fetch `/users/me`
- [ ] Cloudinary upload uses plain `fetch` without credentials
- [ ] Your dev/preview/prod URLs sent to backend for `CORS_ORIGIN`

Related: [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md) (all endpoints & screens) · [API-CHANGELOG-v1.1.md](./API-CHANGELOG-v1.1.md) (verification & uploads)
