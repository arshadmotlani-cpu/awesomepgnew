/* eslint-disable no-console */
/**
 * @deprecated Prefer npm run admin:standardize with ECOSYSTEM_ADMIN_PASSWORD.
 */
import 'dotenv/config';
import { closeDb, createClient } from '../src/db/client';
import { bootstrapAdminIfNeeded } from '../src/lib/auth/bootstrapAdmin';

async function main() {
  if (!process.env.ECOSYSTEM_ADMIN_PASSWORD?.trim() && !process.env.ADMIN_INITIAL_PASSWORD?.trim()) {
    console.error('Set ECOSYSTEM_ADMIN_PASSWORD (or ADMIN_INITIAL_PASSWORD) in the environment first.');
    process.exit(1);
  }

  createClient({ max: 1 });
  const result = await bootstrapAdminIfNeeded();
  if (result === 'skipped') {
    console.log('Admin bootstrap skipped — password env not set or upsert failed.');
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
