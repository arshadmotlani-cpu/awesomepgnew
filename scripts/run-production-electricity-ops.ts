/* eslint-disable no-console */
/**
 * Production June 2026 electricity ops — CLI / Vercel build hook.
 *
 *   RUN_JUNE_ELECTRICITY_OPS=1 npm run vercel-build   # on Vercel (production DATABASE_URL)
 *   npx tsx scripts/run-production-electricity-ops.ts
 *   npx tsx scripts/run-production-electricity-ops.ts --admin-email you@example.com
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';

process.env.DATABASE_POOL_MAX = process.env.DATABASE_POOL_MAX || '3';
loadAppEnv();

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
    adminEmail: adminEmail || undefined,
    onLog: (line) => {
      process.stdout.write(`${line}\n`);
    },
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
