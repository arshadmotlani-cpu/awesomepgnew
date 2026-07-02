/* eslint-disable no-console */
/**
 * Cancel pending electricity invoices when the same booking+month is already paid.
 * Usage: DATABASE_URL=... npx tsx scripts/repair-paid-month-elec-duplicates.ts
 */
import { readFileSync } from 'node:fs';

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.bak', '.env.off', '.env.local']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env.DATABASE_URL = value;
        console.log(`Using DATABASE_URL from ${path}`);
        return;
      }
    } catch {
      // next
    }
  }
}

loadDatabaseUrl();

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const { cancelPendingElectricityWhenBookingMonthPaid } = await import(
    '../src/services/electricityInvoiceDuplicates'
  );
  const result = await cancelPendingElectricityWhenBookingMonthPaid({ adminId: 'repair-script' });
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log('Cancelled:', result.cancelled);
  const { db } = await import('../src/db/client');
  await db.$client.end?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
