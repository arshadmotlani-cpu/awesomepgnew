/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('oct-residents');
async function main() {
  const { sql, eq, and, inArray, ne } = await import('drizzle-orm');
  const { db, closeDb } = await import('../src/db/client');
  const { bookings, bedReservations, customers, rentInvoices } = await import('../src/db/schema');
  const { resolveMonthlyRentPaiseForBooking } = await import('../src/lib/billing/rentPricingSsot');
  const BM = '2026-10-01';
  const AS = '2026-10-05';
  const oct = await db.execute<{ rent_billed: string; rent_paid: string; elec_billed: string; elec_paid: string }>(sql`
    SELECT
      (SELECT coalesce(sum(ri.rent_paise - ri.discount_paise + coalesce(ri.late_fee_locked_paise,0)),0)::bigint FROM rent_invoices ri JOIN bookings b ON b.id=ri.booking_id JOIN customers c ON c.id=ri.customer_id WHERE ri.billing_month=${BM}::date AND ri.is_adhoc=false AND ri.status!='cancelled' AND b.is_test=false AND c.is_test=false) AS rent_billed,
      (SELECT coalesce(sum(ri.paid_principal_paise + ri.paid_late_fee_paise),0)::bigint FROM rent_invoices ri JOIN bookings b ON b.id=ri.booking_id JOIN customers c ON c.id=ri.customer_id WHERE ri.billing_month=${BM}::date AND ri.status='paid' AND b.is_test=false AND c.is_test=false) AS rent_paid,
      (SELECT coalesce(sum(ei.amount_paise),0)::bigint FROM electricity_invoices ei JOIN bookings b ON b.id=ei.booking_id JOIN customers c ON c.id=ei.customer_id WHERE ei.billing_month=${BM}::date AND ei.status!='cancelled' AND b.is_test=false AND c.is_test=false) AS elec_billed,
      (SELECT coalesce(sum(ei.paid_paise),0)::bigint FROM electricity_invoices ei JOIN bookings b ON b.id=ei.booking_id JOIN customers c ON c.id=ei.customer_id WHERE ei.billing_month=${BM}::date AND ei.status='paid' AND b.is_test=false AND c.is_test=false) AS elec_paid
  `);
  console.log('October paise', oct[0]);
  const rows = await db
    .select({ bookingId: bookings.id, name: customers.fullName, mode: bookings.durationMode })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(
      bedReservations,
      and(
        eq(bedReservations.bookingId, bookings.id),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
      ),
    )
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        sql`${AS}::date <@ ${bedReservations.stayRange}`,
      ),
    );
  let sum = 0;
  let miss = 0;
  for (const r of rows) {
    const resolved = await resolveMonthlyRentPaiseForBooking(r.bookingId, BM);
    sum += resolved.rentPaise;
    const [inv] = await db
      .select({ status: rentInvoices.status })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.bookingId, r.bookingId),
          eq(rentInvoices.billingMonth, BM),
          eq(rentInvoices.isAdhoc, false),
          ne(rentInvoices.status, 'cancelled'),
        ),
      )
      .limit(1);
    if (!inv) {
      miss++;
      console.log('MISSING_OCT_RENT', r.name, r.mode);
    }
  }
  console.log('Residents', rows.length, 'sumEffectiveRentPaise', sum, 'INR', sum / 100, 'missingInvoices', miss);
  await closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
