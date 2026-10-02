/* eslint-disable no-console */
/** Targeted October 2026 rent generation for bookings missing monthly bills (SSOT). */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-october-2026-missing-rent.ts');

const BILLING_MONTH = '2026-10-01';
const AS_OF = '2026-10-01';
/** APG-2026-0094 Saswat, APG-2026-0090 Syed — verified missing in pre-audit. */
const BOOKING_CODES = ['APG-2026-0094', 'APG-2026-0090'];

async function main() {
  const { closeDb, db } = await import('../src/db/client');
  const { bookings } = await import('../src/db/schema');
  const { eq, inArray } = await import('drizzle-orm');
  const { generateRentInvoicesForMonth } = await import('../src/services/rentInvoices');
  const { syncPendingRentInvoicesFromSsot } = await import('../src/lib/billing/rentPricingSsot');

  const rows = await db
    .select({ id: bookings.id, bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(inArray(bookings.bookingCode, BOOKING_CODES));

  const bookingIds = rows.map((r) => r.id);
  console.log('Bookings:', rows);

  const gen = await generateRentInvoicesForMonth({
    billingMonth: BILLING_MONTH,
    asOf: AS_OF,
    forceAll: true,
    bookingIds,
  });
  console.log('generateRentInvoicesForMonth:', gen);

  for (const id of bookingIds) {
    const synced = await syncPendingRentInvoicesFromSsot(id, BILLING_MONTH);
    console.log('syncPendingRentInvoicesFromSsot', id, synced);
  }

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  const { closeDb } = await import('../src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});
