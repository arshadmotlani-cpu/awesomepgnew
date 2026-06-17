/**
 * CLI: full financial clean start (requires DATABASE_URL).
 *
 * Usage: npx tsx -r dotenv/config scripts/run-full-financial-clean-start.ts
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import {
  previewFullFinancialCleanStart,
  runFullFinancialCleanStart,
} from '../src/services/fullFinancialCleanStart';
import type { AdminSession } from '../src/lib/auth/session';

const session: AdminSession = {
  kind: 'admin',
  sessionId: 'script',
  adminId: '00000000-0000-0000-0000-000000000001',
  email: 'script@awesomepg.internal',
  fullName: 'Financial clean start',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

async function main() {
  const preview = await previewFullFinancialCleanStart();
  console.log('Preview:', JSON.stringify(preview, null, 2));
  const result = await runFullFinancialCleanStart(session);
  console.log('Done:', JSON.stringify(result, null, 2));
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
