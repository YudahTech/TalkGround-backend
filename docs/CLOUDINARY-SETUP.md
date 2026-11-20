# TalkGround — Cloudinary setup

Cloudinary stores review photos, private receipts, brand logos and avatars. The browser uploads
files **directly** to Cloudinary using a short-lived signature from the API
(`POST /api/v1/uploads/signature`), so the API secret never leaves the backend.

| Folder | Used for | Delivery |
|---|---|---|
| `talkground/reviews` | Review photos (max 3 per review) | Public |
| `talkground/receipts` | Proof-of-visit receipts | **Private** (`authenticated`): only signed moderator links work |
| `talkground/brands` | Brand logos | Public |
| `talkground/avatars` | Profile photos | Public |

Every upload is limited to JPG, PNG or WebP. The API rejects files over 5 MB, and any URL
outside these folders or outside your Cloudinary account.

---

## 1. Get the three credentials

1. Sign in at https://console.cloudinary.com.
2. Open **Settings (gear icon) → API Keys** (or the **Dashboard → Product Environment Credentials** card).
3. Copy:
   - **Cloud name** (e.g. `dxyz123ab`)
   - **API Key** (a number)
   - **API Secret** (click the eye icon to reveal it)

The API Secret is a password: never put it in the frontend, in git or in chat.

## 2. Local development

Add the three values to `apps/api/.env` (this file is gitignored):

```env
CLOUDINARY_CLOUD_NAME="dxyz123ab"
CLOUDINARY_API_KEY="123456789012345"
CLOUDINARY_API_SECRET="your-secret"
```

Then check that everything works end to end:

```bash
cd apps/api
npm run build
npm run cloudinary:verify
```

Expected output (the test images are deleted afterwards):

```text
PASS  credentials accepted (Admin API ping)
PASS  signed photo upload to talkground/reviews
PASS  API validator accepts the photo URL
PASS  photo is publicly viewable
PASS  signed private receipt upload to talkground/receipts
PASS  receipt stored as type=authenticated
PASS  API validator accepts the receipt URL
PASS  receipt NOT viewable by plain URL
PASS  receipt viewable via signed moderator link
PASS  SVG rejected by signed allowed_formats

Cloudinary is set up correctly.
```

## 3. Production (Render)

1. Render dashboard → the TalkGround API service → **Environment**.
2. Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` with the same values.
3. **Save Changes**. Render redeploys automatically.
4. Check: `POST https://<staging-api-host>/api/v1/uploads/signature` (logged in, body
   `{"folder":"reviews"}`) returns `200` with `cloudName`, not `503 Cloudinary is not configured`.

## 4. Recommended Cloudinary settings

In **Settings → Upload → Upload presets**:

- Make sure **no preset is "Unsigned"**. Delete or switch to "Signed" any default `ml_default`
  preset. TalkGround only uses signed uploads; an unsigned preset lets anyone upload to your account.

In **Settings → Security**:

- **Restricted media types:** leave defaults. Do **not** restrict "Authenticated", or moderators can't open receipts.
- **Strict transformations:** optional. Turn it on only if the web app never builds transformation
  URLs itself (e.g. `w_400,c_fill`). It stops strangers spending your transformation credits.

## 5. Frontend notes

- The frontend needs **no Cloudinary keys**. It calls `POST /uploads/signature` and posts every
  key in `data.params` to `data.uploadUrl` (see the v1.1 integration guide, "Uploads").
- Next.js `<Image>`: allow the host in `next.config.js`:

```js
images: { remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }] }
```

## 6. Limits on the free plan

| Limit | Value | Effect |
|---|---|---|
| Admin API calls | 500 / hour | The API makes 1 call per attached photo or receipt to check its size. Above this rate the size check is skipped (logged), and the URL checks still apply |
| Max image size | 10 MB (Cloudinary) | TalkGround rejects anything over 5 MB |
| Storage / bandwidth | Free-plan credits | Watch **Dashboard → Usage** after launch |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `503 Cloudinary is not configured` | Env vars missing on the API | Step 2 / 3 |
| Upload returns `Invalid Signature` | Browser didn't post every key in `params`, or the clock is far off | Post all `params`; retry with a fresh signature (they expire after 1 hour) |
| `Invalid image URL…` from `/reviews/:id/media` | URL edited, wrong folder, or another Cloudinary account | Send Cloudinary's `secure_url` unchanged |
| `Receipts must be uploaded privately` | Receipt uploaded without `type=authenticated` | Use the signature for folder `receipts` |
| Moderator can't open a receipt | "Authenticated" restricted in Security settings | Section 4 |
