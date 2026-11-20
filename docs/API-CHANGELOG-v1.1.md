# TalkGround API v1.1 — Security & trust release (frontend migration guide)

> **Outdated (v1).** API v2.0 replaced this document's endpoints and data model. Use
> [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md) and [API-CHANGELOG-v2.md](./API-CHANGELOG-v2.md).

> **Superseded for auth by v1.2:** Bearer tokens were removed. Auth is HttpOnly-cookie only and
> responses no longer contain `accessToken` / `refreshToken`. Sections 2.1–2.3 below describe the old
> dual mode — follow **[FRONTEND-AUTH.md](./FRONTEND-AUTH.md)** instead. Verification and upload
> changes in this document still apply.

**Released:** 17 November 2026 · **Base URL unchanged:** `https://<staging-api-host>/api/v1`
**Swagger:** https://<staging-api-host>/docs (version 1.1)

Existing login/register/Bearer flows keep working. Two areas need frontend work before users can
post reviews again: **verification screens** and **upload params**. Everything else is additive.

---

## 1. Breaking or behaviour changes — action required

| # | Change | What the frontend must do |
|---|--------|---------------------------|
| 1 | **Writing a review requires a verified email AND phone.** `POST /reviews` returns `403` with `"Verify your email and phone before writing reviews"` (or just `email` / `phone`). | Before the review form, check `user.emailVerified` / `user.phoneVerified` (from `GET /users/me` or the login response) and route to the verification screens below. |
| 2 | **Signup no longer auto-verifies email.** A 6-digit code is emailed on register. | Add an "Enter the code we emailed you" screen (§2.2). |
| 3 | **Phone OTP really checks the code.** Any code used to be accepted. | Show real errors from `confirm-otp` (`Invalid code`, `Code expired…`, `Too many wrong attempts…`). |
| 4 | **Cloudinary uploads must post the signed `params`.** `POST /uploads/signature` now signs `allowed_formats` (and `type=authenticated` for receipts). Uploads that omit them fail at Cloudinary with "Invalid Signature". | Post **every key in `data.params`** plus `file`, `api_key`, `signature` to `data.uploadUrl` (§3). |
| 5 | **`POST /reviews/:id/media` validates the URL.** Only images in TalkGround's Cloudinary under `talkground/reviews` (photos) or private `talkground/receipts` (receipts), jpg/jpeg/png/webp, ≤ 5 MB. | Send Cloudinary's `secure_url` unchanged. |
| 6 | **Receipt responses no longer echo the URL** (it is private). | Show "Receipt submitted" from the 201; don't display the receipt image to the author. |
| 7 | **Review `edited` now means "the author edited it"** (it used to flip on view counts). New field `editedAt`. | Show "Edited {editedAt}" when `edited` is true. |
| 8 | **Own-review guards:** you can't vote helpful on or report your own review (`400`); a second open report by the same user is `409`. | Hide those buttons on the author's own review. |
| 9 | **3 reports from different users hide a review** until a moderator decides. | Nothing; it disappears from lists. |
| 10 | **Rate limits.** Exceeding returns `429 TOO_MANY_REQUESTS`. | Show "Too many attempts, try again in a minute". |
| 11 | **Login lockout.** 10 wrong passwords → `429` "Too many failed attempts…" for 15 minutes. | Show the message; link to "Forgot password". |
| 12 | **Suspended accounts** get `403` on login (was a token that then failed). | Show the message. |
| 13 | **Admin area:** new `MODERATOR` role. Moderators: dashboard, queues, review moderation, suggestions, edit brand. Admin only: create/deactivate brand, users, suspend, roles, audit log. | Hide admin-only screens when `user.role === 'MODERATOR'`. |

Rate limits (per IP per minute): register 5 · login 10 · refresh 30 · forgot-password 3 ·
reset-password 5 · send email code 3 · send phone OTP 3 · confirm codes 10 · everything else 120.

---

## 2. Authentication

### 2.1 Bearer **and** HttpOnly cookies — both always on

Every session response (`register`, `login`, `refresh`, `change-password`) returns:

```json
{
  "data": {
    "accessToken": "eyJ…",
    "refreshToken": "q8Vd…",          // now a real, separate, single-use token
    "expiresIn": 604800,              // seconds until accessToken expires
    "refreshTokenExpiresAt": "2026-12-17T…",
    "user": { "id": "…", "emailVerified": false, "phoneVerified": false, "phone": "+2348…", "role": "USER", … }
  }
}
```

…and sets two HttpOnly cookies: `talkground_at` (access, path `/`) and `talkground_rt` (refresh, path `/api/v1/auth`).

The API accepts **either** on every protected route (Bearer header is checked first). Pick one mode:

| Mode | How | Notes |
|------|-----|-------|
| **Bearer (current)** | Keep sending `Authorization: Bearer <accessToken>`. Store `refreshToken` and call `/auth/refresh` on `401`. | No change needed today. |
| **Cookies** | `fetch(url, { credentials: 'include' })`, never touch tokens in JS. Call `/auth/refresh` with an empty body on `401`. | Requires backend env `COOKIE_SAMESITE=none` while web (vercel.app) and API (onrender.com) are on different sites. State-changing cookie requests must come from an origin in `CORS_ORIGIN`, otherwise `403 Cross-site request blocked`. |

Switching between the two is a frontend-only change.

### 2.2 New and changed endpoints

| Method | Path | Auth | Body | Notes |
|--------|------|------|------|-------|
| `POST` | `/auth/refresh` | – | `{ refreshToken? }` (or cookie) | Returns a new pair. The old refresh token stops working; **replaying a used one signs the user out everywhere**, so refresh once and share the promise between parallel requests. |
| `POST` | `/auth/logout` | optional | `{ refreshToken?, allDevices? }` | Revokes the refresh token, invalidates current access tokens, clears cookies. |
| `POST` | `/auth/verify-email/send-code` | JWT | – | Emails a new 6-digit code (old codes die). |
| `POST` | `/auth/verify-email/confirm` | JWT | `{ otp }` | Returns `{ user }` with `emailVerified: true`. |
| `POST` | `/auth/verify-phone/send-otp` | JWT | `{ phone? }` | Optional `phone` sets/changes the number (stored as `+234…`, resets `phoneVerified`). |
| `POST` | `/auth/verify-phone/confirm-otp` | JWT | `{ otp }` | 5 wrong tries kill the code. A phone can be verified on only one account (`409`). |
| `POST` | `/auth/forgot-password` | – | `{ email }` | Emails a link to `{FRONTEND_URL}/reset-password?token=…` (valid 30 min, single use). Same response whether or not the email exists. |
| `POST` | `/auth/reset-password` | – | `{ token, password }` | Signs out all sessions. Then send the user to login. |
| `POST` | `/auth/change-password` | JWT | `{ currentPassword, newPassword }` | Returns a fresh session; other devices are signed out. |
| `GET` | `/users/me/export` | JWT | – | All the user's data as JSON (NDPA). |
| `DELETE` | `/users/me` | JWT | `{ password }` | Irreversible account deletion (NDPA). |

**Frontend pages to add:** `/verify-email` (code entry + resend), phone verification (number + code),
`/reset-password?token=` (new password form), "Delete my account" and "Download my data" in settings.

> Dev/testing only: when the backend runs with `EMAIL_DEV_MODE=true` / `OTP_DEV_MODE=true`, the
> responses include `devEmailCode` / `devCode` so you can test without real email/SMS. Never rely on
> these fields in production UI.

### 2.3 Recommended refresh handling (Bearer mode)

```ts
let refreshing: Promise<string> | null = null;

async function api(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const res = await fetch(API + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${getAccess()}` } });
  if (res.status !== 401 || !retry) return res;

  refreshing ??= fetch(API + '/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: getRefresh() }),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error('session expired');
      const { data } = await r.json();
      saveTokens(data.accessToken, data.refreshToken);
      return data.accessToken as string;
    })
    .finally(() => (refreshing = null));

  try {
    await refreshing;
  } catch {
    logoutLocally();
    return res;
  }
  return api(path, init, false);
}
```

---

## 3. Uploads (Cloudinary)

`POST /uploads/signature` body `{ "folder": "reviews" | "receipts" | "brands" | "avatars" }` returns:

```json
{
  "data": {
    "cloudName": "…", "apiKey": "…", "timestamp": 1763380000, "signature": "…",
    "folder": "talkground/receipts",
    "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud>/image/upload",
    "params": { "timestamp": 1763380000, "folder": "talkground/receipts", "allowed_formats": "jpg,jpeg,png,webp", "type": "authenticated" },
    "maxBytes": 5242880,
    "allowedFormats": ["jpg", "jpeg", "png", "webp"]
  }
}
```

```ts
const { data: s } = await (await api('/uploads/signature', { method: 'POST', body: JSON.stringify({ folder }) })).json();
if (file.size > s.maxBytes) throw new Error('Image must be 5 MB or smaller');
const form = new FormData();
form.append('file', file);
form.append('api_key', s.apiKey);
form.append('signature', s.signature);
for (const [k, v] of Object.entries(s.params)) form.append(k, String(v));
const uploaded = await (await fetch(s.uploadUrl, { method: 'POST', body: form })).json();
await api(`/reviews/${reviewId}/media`, {
  method: 'POST',
  body: JSON.stringify({ type: folder === 'receipts' ? 'receipt' : 'photo', url: uploaded.secure_url }),
});
```

---

## 4. New response fields

| Where | Field | Meaning |
|-------|-------|---------|
| Brand (list + detail) | `hasEnoughReviews`, `minReviewsForRating` (5) | When `hasEnoughReviews` is false, show **"Not enough reviews yet (n)"** instead of the average. Rating sorts list these brands last. |
| Review | `editedAt` | Set only when the author edits. |
| `POST /brand-suggestions` | `possibleDuplicates[]` | Show "Did you mean…?" with links to existing brands. |
| Session responses | `expiresIn`, `refreshTokenExpiresAt`, `user.phone` | See §2.1. |
| `GET /admin/suggestions` | `possibleDuplicates[]` per suggestion | Show before approving. |
| `GET /admin/reviews/queue` | receipt `media[].url` is a signed private link | Open in a new tab; don't cache. |

New report reasons: `PERSONAL_INFO`, `CONFLICT_OF_INTEREST`.

## 5. New admin endpoints

| Method | Path | Role |
|--------|------|------|
| `GET` | `/admin/reviews/:id/revisions` | moderator+ — edit history |
| `GET` | `/admin/users?q=&page=&limit=` | admin |
| `PATCH` | `/admin/users/:id/role` `{ role: USER\|MODERATOR\|ADMIN }` | admin |
| `GET` | `/admin/audit-logs?targetType=&targetId=&actorId=&page=` | admin |

All moderation, brand, suggestion, suspension and role actions are written to the audit log with the acting admin.
