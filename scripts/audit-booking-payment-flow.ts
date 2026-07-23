/**
 * One-off audit: trace payment → invoice → ledger for a booking code.
 * Usage: npx tsx scripts/audit-booking-payment-flow.ts --code APG-2026-0045
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { splitBookingPayment } from '@/src/services/depositCollection';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { prorateForMonth } from '@/src/services/billing';

loadProductionAuditEnv();
requireDatabaseUrl();

const code = process.argv.find((a) => a.startsWith('--code='))?.split('=')[1]
  ?? process.argv[process.argv.indexOf('--code') + 1]
  ?? 'APG-2026-0045';

async function main() {
  const [booking] = await db.execute<{
    id: string;
    booking_code: string;
    subtotal_paise: number;
    discount_paise: number;
    deposit_paise: number;
    total_paise: number;
    rent_received_paise: number;
    duration_mode: string;
    pricing_snapshot: unknown;
    created_at: string;
  }>(sql`
    SELECT id, booking_code,
      subtotal_paise::bigint::int, discount_paise::bigint::int,
      deposit_paise::bigint::int, total_paise::bigint::int,
      rent_received_paise::bigint::int, duration_mode,
      pricing_snapshot, created_at::text
    FROM bookings WHERE booking_code = ${code} LIMIT 1
  `);
  if (!booking) throw new Error(`Booking ${code} not found`);
  const b = booking as typeof booking;

  const stay = await db.execute<{ stay_start: string; stay_end: string | null }>(sql`
    SELECT
      to_char(lower(stay_range), 'YYYY-MM-DD') AS stay_start,
      CASE WHEN upper(stay_range) IS NULL THEN NULL
           ELSE to_char(upper(stay_range), 'YYYY-MM-DD') END AS stay_end
    FROM bed_reservations
    WHERE booking_id = ${b.id} AND kind = 'primary' LIMIT 1
  `);

  const payments = await db.execute(sql`
    SELECT id, purpose, status, amount_paise::bigint::int AS amount_paise,
      provider, provider_payment_id, paid_at::text, created_at::text, raw_payload
    FROM payments WHERE booking_id = ${b.id} ORDER BY created_at
  `);

  const rentInvoices = await db.execute(sql`
    SELECT id, invoice_number, billing_month::text, rent_paise::bigint::int,
      paid_principal_paise::bigint::int, status, payment_id, notes,
      created_at::text, paid_at::text
    FROM rent_invoices WHERE booking_id = ${b.id} ORDER BY billing_month
  `);

  const depositLedger = await db.execute(sql`
    SELECT id, entry_kind, amount_paise::bigint::int, related_payment_id,
      reason, created_at::text
    FROM deposit_ledger WHERE booking_id = ${b.id} ORDER BY created_at
  `);

  const creditLedger = await db.execute(sql`
    SELECT id, entry_kind, amount_paise::bigint::int, reason,
      related_payment_id, created_at::text
    FROM resident_credit_ledger WHERE booking_id = ${b.id} ORDER BY created_at
  `).catch(() => []);

  const pgRecords = await db.execute(sql`
    SELECT id, amount_paise::bigint::int, confirmed_amount_paise::bigint::int,
      proof_snapshot_submitted_paise::bigint::int,
      proof_snapshot_checkout_total_paise::bigint::int,
      proof_snapshot_rent_due_paise::bigint::int,
      proof_snapshot_deposit_due_paise::bigint::int,
      status, transaction_ref, reviewed_at::text, created_at::text
    FROM pg_payment_records WHERE booking_id = ${b.id} ORDER BY created_at
  `);

  const audit = await db.execute(sql`
    SELECT entity, entity_id::text, action, diff, created_at::text
    FROM audit_log
    WHERE (entity = 'rent_invoice' AND entity_id IN (
      SELECT id FROM rent_invoices WHERE booking_id = ${b.id}
    ))
    OR (entity = 'booking' AND entity_id = ${b.id})
    OR (entity = 'payment' AND entity_id IN (
      SELECT id FROM payments WHERE booking_id = ${b.id}
    ))
    ORDER BY created_at
  `);

  const breakdown = breakdownBookingCheckoutPayment({
    subtotalPaise: b.subtotal_paise,
    discountPaise: b.discount_paise,
    depositPaise: b.deposit_paise,
    pricingSnapshot: b.pricing_snapshot as never,
  });

  const paymentRow = (payments as { amount_paise: number }[])[0];
  const split = paymentRow
    ? splitBookingPayment(
        {
          subtotalPaise: b.subtotal_paise,
          discountPaise: b.discount_paise,
          depositPaise: b.deposit_paise,
          totalPaise: b.total_paise,
          pricingSnapshot: b.pricing_snapshot as never,
        },
        paymentRow.amount_paise,
      )
    : null;

  const stayStart = (stay as { stay_start: string }[])[0]?.stay_start ?? '2026-07-04';
  const prorated = prorateForMonth({
    monthlyRatePaise: b.subtotal_paise - b.discount_paise,
    billingMonth: '2026-07-01',
    activeStart: stayStart,
    activeEnd: '9999-12-31',
  });

  const balances = await getBookingMoneyBalances(b.id);

  console.log(JSON.stringify({
    booking: b,
    stay: stay[0] ?? null,
    breakdown,
    split,
    prorateForMonthJuly: prorated,
    gapPaise: breakdown.rentDuePaise - (prorated.amountPaise),
    balances,
    payments,
    pgPaymentRecords: pgRecords,
    rentInvoices,
    depositLedger,
    residentCreditLedger: creditLedger,
    auditLog: audit,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
