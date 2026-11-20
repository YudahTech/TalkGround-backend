import { execSync } from 'child_process';
import * as path from 'path';

/** Fresh schema + demo seed before the suite. Guarded by the same DATABASE_URL check as setup-env.ts. */
export default function globalSetup() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/_test(\?|$)/.test(url)) {
    throw new Error(
      'Refusing to reset a non-test database. See test/setup-env.ts.',
    );
  }
  const cwd = path.resolve(__dirname, '..');
  const env = {
    ...process.env,
    DATABASE_URL: url,
    NODE_ENV: 'test',
    SEED_DEMO_PASSWORD: 'E2e-Demo-Password-1',
    SEED_ADMIN_PASSWORD: 'E2e-Admin-Password-1',
  };
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd,
    env,
    stdio: 'inherit',
  });
  execSync('npx ts-node --project prisma/tsconfig.json prisma/seed.ts', {
    cwd,
    env,
    stdio: 'inherit',
  });
}
