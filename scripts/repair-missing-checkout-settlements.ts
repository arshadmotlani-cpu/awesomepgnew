/**
 * Repair completed bookings that have deposit but no checkout_settlements row.
 *
 * Usage:
 *   npx tsx scripts/repair-missing-checkout-settlements.ts
 *   npx tsx scripts/repair-missing-checkout-settlements.ts --booking APG-2026-0015
 *   npx tsx scripts/repair-missing-checkout-settlements.ts --dry-run
 */
import { readFileSync } from 'node:fs';
import { loadAppEnv } from '@/src/lib/db/loadEnv';
import { hasDatabaseUrl } from '@/src/lib/db/env';
import { repairMissingCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { closeDb } from '@/src/db/client';

function loadDatabaseUrlFromBackupFiles(): void {
  if (hasDatabaseUrl()) return;
  for (const path of [
    '.env.production.local',
    '.env.local.ci-bak',
    '.env.local',
    '.env.off',
    '.env.bak',
  ]) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value && value.length > 20) {
        process.env.DATABASE_URL = value;
        return;
      }
    } catch {
      // try next
    }
  }
}

if (!hasDatabaseUrl()) {
  loadAppEnv();
}
loadDatabaseUrlFromBackupFiles();

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const bookingCode = arg('--booking');
  const dryRun = process.argv.includes('--dry-run');

  const result = await repairMissingCheckoutSettlements({ bookingCode, dryRun });

  console.log(`Scanned: ${result.scanned}`);
  console.log(`${dryRun ? 'Would repair' : 'Repaired'}: ${result.repaired}`);
  if (result.failures.length > 0) {
    console.log('Failures:');
    for (const f of result.failures) {
      console.log(`  ${f.bookingCode}: ${f.error}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
