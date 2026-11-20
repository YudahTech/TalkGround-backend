/**
 * One-time, secure creation of a production super admin (PRD v2.5 §15).
 *
 *   ADMIN_EMAIL=you@yourdomain.ng ADMIN_NAME="Your Name" ADMIN_USERNAME=your_name \
 *   npm run admin:create
 *
 * - The password is generated (24 random bytes) and printed ONCE. Nothing is written to disk.
 * - Set ADMIN_PASSWORD (min 16 chars) only if you must choose it yourself.
 * - If the email already exists, it is only promoted when PROMOTE_EXISTING=true (password unchanged).
 * - The action is written to the audit log.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const displayName = process.env.ADMIN_NAME?.trim();
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Set ADMIN_EMAIL');
  if (!displayName || !username || !/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new Error(
      'Set ADMIN_NAME and ADMIN_USERNAME (3–30 lowercase letters, numbers or _)',
    );
  }
  if (/\.(test|invalid|example)$|@example\.com$/.test(email))
    throw new Error('Use a real address you control, not a demo domain');

  const role = await prisma.adminRole.findUnique({
    where: { key: 'super_admin' },
  });
  if (!role)
    throw new Error('super_admin role missing — run the migrations first');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (process.env.PROMOTE_EXISTING !== 'true')
      throw new Error(
        'That email exists. Set PROMOTE_EXISTING=true to promote it.',
      );
    if (!existing.emailVerified)
      throw new Error('Verify the email address of that account first');
    await prisma.user.update({
      where: { id: existing.id },
      data: { adminRoleId: role.id, tokenVersion: { increment: 1 } },
    });
    await prisma.auditLog.create({
      data: {
        action: 'role.assign',
        targetType: 'role',
        targetId: existing.id,
        actorRole: 'system',
        before: { role: null },
        after: { role: 'super_admin' },
        reason: 'create-admin script',
      },
    });
    console.log(`Promoted ${email} to super admin. Password unchanged.`);
    return;
  }

  const supplied = process.env.ADMIN_PASSWORD;
  if (supplied && supplied.length < 16)
    throw new Error('ADMIN_PASSWORD must be at least 16 characters');
  const password = supplied || randomBytes(24).toString('base64url');
  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      username,
      passwordHash: await bcrypt.hash(password, 12),
      emailVerified: true,
      adminRoleId: role.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      action: 'role.assign',
      targetType: 'role',
      targetId: user.id,
      actorRole: 'system',
      after: { role: 'super_admin' },
      reason: 'create-admin script',
    },
  });
  console.log(`Created super admin ${email}.`);
  if (!supplied)
    console.log(
      `Password (shown once, store it in a password manager, then change it after first login): ${password}`,
    );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
