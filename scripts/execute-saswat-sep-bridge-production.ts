#!/usr/bin/env npx tsx
/**
 * Create Saswat Sep 9–30 bridge transition invoice on production (idempotent).
 *   USE_PRODUCTION_DB=1 npx tsx scripts/execute-saswat-sep-bridge-production.ts
 */
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('execute-saswat-sep-bridge-production.ts');
import { closeDb, db } from '../src/db/client';
import { adminUsers } from '../src/db/schema/adminUsers';
import { bookings } from '../src/db/schema';
import { createBillingCycleBridgeInvoice } from '../src/services/billingCycleMigration';
import { evaluateAnniversaryRentGenerationEligibility } from '../src/services/rentInvoices';
import { paiseToInr } from '@/src/lib/format';

const BOOKING_CODE = 'APG-2026-0094';
const PERIOD_START = '2026-09-09';
const PERIOD_END = '2026-09-30';

async function main() {
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin');

  const session = {
    adminId: admin.id,
    role: 'super_admin' as const,
    pgScope: null,
    email: admin.email,
  };

  const [bk] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.bookingCode, BOOKING_CODE))
    .limit(1);
  if (!bk) throw new Error('Booking not found');

  const result = await createBillingCycleBridgeInvoice(session, {
    bookingId: bk.id,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    note: 'Sep 9–30 bridge after paid-through Sep 8 — calendar month migration',
  });

  console.log('BRIDGE', JSON.stringify(result));

  const eligSep = await evaluateAnniversaryRentGenerationEligibility({
    bookingId: bk.id,
    billingMonth: '2026-09-01',
    asOf: '2026-09-01',
    forceAll: false,
  });
  const eligOct = await evaluateAnniversaryRentGenerationEligibility({
    bookingId: bk.id,
    billingMonth: '2026-10-01',
    asOf: '2026-10-01',
    forceAll: false,
  });
  console.log(
    'ELIG_SEP',
    eligSep.eligible,
    eligSep.skipCode,
    eligSep.rentPaise ? paiseToInr(eligSep.rentPaise) : null,
  );
  console.log(
    'ELIG_OCT',
    eligOct.eligible,
    eligOct.skipCode,
    eligOct.rentPaise ? paiseToInr(eligOct.rentPaise) : null,
  );
}

main().then(() => closeDb()).catch((e) => {
  console.error(e);
  closeDb().finally(() => process.exit(1));
});
