/**
 * Runs before every e2e test file. The suite resets the database, so it refuses to run unless
 * DATABASE_URL clearly points at a local *_test database.
 */
const url = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(url) || !/_test(\?|$)/.test(url)) {
  throw new Error(
    'E2E tests reset the database. Set DATABASE_URL to a LOCAL database whose name ends in "_test", e.g. postgresql://postgres:postgres@localhost:5544/talkground_test',
  );
}
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'e2e-secret-e2e-secret-e2e-secret-1234';
process.env.JWT_EXPIRES_IN = '7d'; // deliberately above the cap: the API must clamp it to 15 minutes
process.env.EMAIL_DEV_MODE = 'true';
process.env.OTP_DEV_MODE = 'true';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.FRONTEND_URL = 'https://talkground.example';
process.env.BREVO_API_KEY = '';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.SEED_DEMO_PASSWORD = 'E2e-Demo-Password-1';
process.env.SEED_ADMIN_PASSWORD = 'E2e-Admin-Password-1';
process.env.FRONTEND_REVALIDATE_URL = '';
