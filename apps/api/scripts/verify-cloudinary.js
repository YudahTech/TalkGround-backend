/**
 * End-to-end check of the Cloudinary setup, exactly as the web app uses it.
 *
 *   npm run cloudinary:verify      (reads apps/api/.env, or real env vars on a server)
 *
 * 1. Credentials work (Admin API ping)
 * 2. A browser-style signed photo upload to talkground/reviews succeeds,
 *    and the API's own validator (dist/uploads) accepts the returned URL
 * 3. A receipt uploaded with type=authenticated is NOT viewable by its plain URL,
 *    but IS viewable through the signed moderator link
 * 4. A non-image upload is rejected by the signed allowed_formats
 * 5. Test files are deleted afterwards
 *
 * Requires `npm run build` first (it reuses dist/uploads/uploads.service.js).
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  }
}

loadEnv();
const { v2: cloudinary } = require('cloudinary');
const { UploadsService } = require(path.join(__dirname, '..', 'dist', 'uploads', 'uploads.service.js'));

const config = { get: (k, d) => process.env[k] ?? d };
const uploads = new UploadsService(config);

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let failures = 0;
const created = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !extra ? '' : `  (${extra})`}`);
  if (!cond) failures++;
};

async function browserUpload(folder, file, filename) {
  const s = uploads.getSignature(folder);
  const form = new FormData();
  form.append('file', new Blob([file]), filename);
  form.append('api_key', s.apiKey);
  form.append('signature', s.signature);
  for (const [k, v] of Object.entries(s.params)) form.append(k, String(v));
  const res = await fetch(s.uploadUrl, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}

(async () => {
  for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
    if (!process.env[k]) {
      console.error(`Missing ${k}. Add it to apps/api/.env (local) or the Render environment.`);
      process.exit(1);
    }
  }

  try {
    const ping = await cloudinary.api.ping();
    ok('credentials accepted (Admin API ping)', ping.status === 'ok');
  } catch (err) {
    ok('credentials accepted (Admin API ping)', false, err?.error?.message ?? String(err));
    process.exit(1);
  }

  // Photo
  const photo = await browserUpload('reviews', PNG, 'verify.png');
  ok('signed photo upload to talkground/reviews', photo.status === 200, JSON.stringify(photo.body?.error ?? photo.body));
  if (photo.status === 200) {
    created.push({ id: photo.body.public_id, type: 'upload' });
    try {
      await uploads.verifyAsset(photo.body.secure_url, 'reviews');
      ok('API validator accepts the photo URL', true);
    } catch (err) {
      ok('API validator accepts the photo URL', false, err.message);
    }
    const pub = await fetch(photo.body.secure_url);
    ok('photo is publicly viewable', pub.status === 200, `HTTP ${pub.status}`);
  }

  // Receipt (private)
  const receipt = await browserUpload('receipts', PNG, 'receipt.png');
  ok('signed private receipt upload to talkground/receipts', receipt.status === 200, JSON.stringify(receipt.body?.error ?? receipt.body));
  if (receipt.status === 200) {
    created.push({ id: receipt.body.public_id, type: 'authenticated' });
    ok('receipt stored as type=authenticated', receipt.body.type === 'authenticated', receipt.body.type);
    try {
      await uploads.verifyAsset(receipt.body.secure_url, 'receipts');
      ok('API validator accepts the receipt URL', true);
    } catch (err) {
      ok('API validator accepts the receipt URL', false, err.message);
    }
    const plain = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/authenticated/${receipt.body.public_id}.${receipt.body.format}`;
    const blocked = await fetch(plain);
    ok('receipt NOT viewable by plain URL', blocked.status === 401 || blocked.status === 404, `HTTP ${blocked.status}`);
    const signed = await fetch(uploads.privateViewUrl(receipt.body.secure_url));
    ok('receipt viewable via signed moderator link', signed.status === 200, `HTTP ${signed.status}`);
  }

  // Wrong format
  const bad = await browserUpload('reviews', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg');
  ok('SVG rejected by signed allowed_formats', bad.status >= 400, `HTTP ${bad.status}`);
  if (bad.status === 200) created.push({ id: bad.body.public_id, type: 'upload' });

  // Cleanup
  for (const a of created) {
    try {
      await cloudinary.uploader.destroy(a.id, { type: a.type, invalidate: true });
    } catch {
      console.log(`  (could not delete test asset ${a.id}; remove it in the Media Library)`);
    }
  }
  console.log(`\n${failures ? `${failures} check(s) failed` : 'Cloudinary is set up correctly.'}`);
  process.exit(failures ? 1 : 0);
})();
