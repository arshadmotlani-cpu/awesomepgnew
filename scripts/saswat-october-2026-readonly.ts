/* eslint-disable no-console */
import { eq, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('saswat-october-2026-readonly.ts');

async function main() {
  const { closeDb, db } = await import('../src/db/client');
  const { bookings } = await import('../src/db/schema');
  const { resolveMonthlyRentPaiseForBooking } = await import('../src/lib/billing/rentPricingSsot');
  const { evaluateAnniversaryRentGenerationEligibility } = await import('../src/services/rentInvoices');

  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, 'APG-2026-0094')).limit(1);
  if (!bk) throw new Error('APG-2026-0094 not found');

  const bedRows = await db.execute<{
    pg: string;
    room_number: string;
    bed_code: string;
    bed_id: string;
    check_in: string;
  }>(sql`
    SELECT p.name AS pg, r.room_number, bd.bed_code, bd.id AS bed_id,
           to_char(lower(br.stay_range), 'YYYY-MM-DD') AS check_in
    FROM bed_reservations br
    JOIN beds bd ON bd.id = br.bed_id
    JOIN rooms r ON r.id = bd.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE br.booking_id = ${bk.id}
      AND br.status = 'active' AND br.kind = 'primary'
      AND CURRENT_DATE <@ br.stay_range
    ORDER BY lower(br.stay_range) DESC
  `);

  const octInv = await db.execute(sql`
    SELECT invoice_number, status, rent_paise, due_date, bed_id, is_adhoc, notes
    FROM rent_invoices
    WHERE booking_id = ${bk.id} AND billing_month = '2026-10-01'
    ORDER BY created_at
  `);

  const adhoc = await db.execute(sql`
    SELECT invoice_number, status, rent_paise, notes
    FROM rent_invoices
    WHERE booking_id = ${bk.id} AND is_adhoc = true AND status != 'cancelled'
    ORDER BY created_at DESC LIMIT 5
  `);

  const resolved = await resolveMonthlyRentPaiseForBooking(bk.id, '2026-10-01');
  const elig = await evaluateAnniversaryRentGenerationEligibility({
    bookingId: bk.id,
    billingMonth: '2026-10-01',
    asOf: '2026-10-01',
    forceAll: true,
    readonly: true,
  });

  console.log(JSON.stringify({ bookingCode: bk.bookingCode, beds: bedRows, octInv, adhoc, resolved, elig }, null, 2));
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  const { closeDb } = await import('../src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});
