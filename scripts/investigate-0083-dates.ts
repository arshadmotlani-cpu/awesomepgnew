#!/usr/bin/env npx tsx
/** Read-only: compare vacate 20 vs 15 for APG-2026-0083 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
import { db, closeDb } from '../src/db/client';
import { sql } from 'drizzle-orm';
import { previewVacatingDateChange } from '../src/services/vacatingDateChange';
import { loadBillingCoverageModel } from '../src/services/billingCoverage';
import { anniversaryBillingPeriod } from '../src/services/billing';
import { diffDays } from '../src/lib/dates';

loadProductionAuditEnv();
requireDatabaseUrl('investigate-0083-dates.ts');

async function main() {
  const code = 'APG-2026-0083';
  const rows = await db.execute(sql`
    SELECT id, booking_code, expected_checkout_date, subtotal_paise, deposit_paise
    FROM bookings WHERE booking_code = ${code} LIMIT 1
  `);
  const booking = rows[0] as Record<string, unknown>;
  if (!booking) throw new Error('booking not found');
  const [stay] = await db.execute(sql`
    SELECT stay_range::text, to_char(lower(stay_range), 'YYYY-MM-DD') AS check_in
    FROM bed_reservations WHERE booking_id = ${booking.id}::uuid AND kind = 'primary'
    ORDER BY created_at DESC LIMIT 1
  `);
  const [vr] = await db.execute(sql`
    SELECT id, status, notice_given_date, vacating_date, customer_id
    FROM vacating_requests WHERE booking_id = ${booking.id}::uuid AND status = 'approved' LIMIT 1
  `);
  const invoices = await db.execute(sql`
    SELECT invoice_number, billing_month, due_date, rent_paise, paid_principal_paise, status
    FROM rent_invoices WHERE booking_id = ${booking.id}::uuid ORDER BY billing_month
  `);
  const [profile] = await db.execute(sql`
    SELECT billing_day FROM resident_billing_profiles WHERE booking_id = ${booking.id}::uuid
  `);

  console.log('=== CANONICAL BOOKING ===');
  console.log(booking);
  console.log('stay', stay[0]);
  console.log('vacating', vr[0]);
  console.log('billing_day', profile[0]?.billing_day);
  console.log('invoices', invoices);

  const inv = invoices.find((i: { invoice_number: string }) =>
    String(i.invoice_number).startsWith('RNT-'),
  ) as { due_date: string; paid_principal_paise: number; rent_paise: number } | undefined;
  if (inv) {
    const period = anniversaryBillingPeriod(String(inv.due_date), Number(profile[0]?.billing_day ?? 21));
    console.log('RNT invoice anniversary period (raw):', period);
    console.log('paid principal', inv.paid_principal_paise, 'rent_paise', inv.rent_paise);
    const days = diffDays(period.periodStart, period.periodEnd) + 1;
    console.log('period calendar days', days, 'daily', Math.floor(inv.paid_principal_paise / days));
  }

  for (const vac of ['2026-08-20', '2026-08-15']) {
    const model = await loadBillingCoverageModel({
      bookingId: String(booking.id),
      vacatingDate: vac,
      noticeGivenDate: String((vr[0] as { notice_given_date: string }).notice_given_date).slice(0, 10),
      monthlyRentPaise: Number(booking.subtotal_paise),
      treatAsApprovedForTail: true,
      stayType: 'monthly',
      durationMode: 'open_ended',
    });
    console.log('\n--- vacating', vac, '---');
    console.log('paidCoverage', model?.paidInvoiceCoverage);
    console.log('paidUntil', model?.paidUntilDate);
    console.log('prepaidDays', model?.prepaidAfterVacatingDays);
    console.log('prepaidPaise', model?.prepaidAfterVacatingPaise);
    console.log('tailRentPaise', model?.tailRentPaise);
  }

  const preview = await previewVacatingDateChange({
    bookingId: String(booking.id),
    customerId: String((vr[0] as { customer_id: string }).customer_id),
    requestedVacatingDate: '2026-08-15',
  });
  console.log('\n=== DATE CHANGE PREVIEW (20 → 15) ===');
  if (preview.ok) {
    console.log('currentRefund', preview.preview.currentEstimatedRefundPaise);
    console.log('requestedRefund', preview.preview.requestedEstimatedRefundPaise);
    console.log('delta', preview.preview.refundDeltaPaise, preview.preview.refundDeltaLabel);
    console.log('current waterfall rent', preview.preview.currentEstimatedSettlement.waterfall.rentBucket);
    console.log('requested waterfall rent', preview.preview.requestedEstimatedSettlement.waterfall.rentBucket);
    console.log('current refund', preview.preview.currentEstimatedSettlement.waterfall.refund);
    console.log('requested refund', preview.preview.requestedEstimatedSettlement.waterfall.refund);
    console.log('deposit held', preview.preview.currentEstimatedSettlement.depositHeldPaise);
  } else {
    console.log('preview error', preview);
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
