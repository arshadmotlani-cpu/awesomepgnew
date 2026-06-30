/* eslint-disable no-console */
/**
 * Production electricity ops — CLI wrapper around src/services/juneElectricityProductionOps.ts
 *
 *   npx tsx scripts/run-production-electricity-ops.ts
 *   npx tsx scripts/run-production-electricity-ops.ts --admin-email you@example.com
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import { hasDatabaseUrl } from '../src/lib/db/env';
import { runJuneElectricityProductionOps } from '../src/services/juneElectricityProductionOps';

function parseAdminEmail(): string {
  const idx = process.argv.indexOf('--admin-email');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  if (process.env.ADMIN_EMAIL?.trim()) return process.env.ADMIN_EMAIL.trim();
  return '';
}

async function main() {
  if (!hasDatabaseUrl()) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const adminEmail = parseAdminEmail();
  await runJuneElectricityProductionOps({
    adminEmail,
    adminId: '00000000-0000-4000-a000-000000000000',
    onLog: (line) => console.log(line),
  });
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('\n✗ FAILED:', err instanceof Error ? err.message : err);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
