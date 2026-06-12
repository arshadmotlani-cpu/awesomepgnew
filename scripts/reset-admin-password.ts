/* eslint-disable no-console */
/**
 * @deprecated Prefer /admin/forgot-password for password recovery.
 * Bootstraps the first admin account only — does not overwrite existing passwords.
 *
 *   ADMIN_INITIAL_PASSWORD='your-secret' npx tsx scripts/reset-admin-password.ts
 */
import 'dotenv/config';
import { createClient, closeDb } from '../src/db/client';
import { bootstrapAdminIfNeeded } from '../src/lib/auth/bootstrapAdmin';

async function main() {
  if (!process.env.ADMIN_INITIAL_PASSWORD?.trim()) {
    console.error('Set ADMIN_INITIAL_PASSWORD in the environment first.');
    process.exit(1);
  }

  createClient({ max: 1 });
  const result = await bootstrapAdminIfNeeded();
  if (result === 'skipped') {
    console.log('Admin account already exists. Use /admin/forgot-password to reset the password.');
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
