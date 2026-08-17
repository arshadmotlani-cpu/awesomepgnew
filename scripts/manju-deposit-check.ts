#!/usr/bin/env npx tsx
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('manju-deposit');
import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { computeNoticeDeductionForBooking } from '@/src/services/noticeDeduction';

const BOOKING_ID = '04265c06-f998-4696-82d9-7b1934c7da35';
const VR_ID = 'b33d0b2c-59f1-45f2-8fcb-f8da1775fa6a';

async function main() {
  const wallet = await getDepositSummaryForBooking(BOOKING_ID);
  console.log('Deposit wallet:', wallet);

  const ledger = await db.execute(sql`
    SELECT entry_kind, amount_paise, reason, created_at::text
    FROM deposit_ledger WHERE booking_id = ${BOOKING_ID}::uuid ORDER BY created_at
  `);
  console.log('Ledger:');
  ledger.forEach((l) =>
    console.log(l.entry_kind, paiseToInr(Number(l.amount_paise)), l.reason?.slice(0, 60)),
  );

  const rent = await db.execute(sql`
    SELECT status, billing_month, rent_paise, paid_principal_paise, invoice_subtype
    FROM rent_invoices WHERE booking_id = ${BOOKING_ID}::uuid ORDER BY billing_month
  `);
  console.log('Rent invoices:');
  rent.forEach((r) =>
    console.log(r.billing_month, r.status, paiseToInr(Number(r.rent_paise)), 'paid', paiseToInr(Number(r.paid_principal_paise || 0)), r.invoice_subtype),
  );

  const vr = await db.execute(sql`
    SELECT id, status, vacating_date::text, deduction_paise, deposit_refund_paise, notice_breakdown_json
    FROM vacating_requests WHERE booking_id = ${BOOKING_ID}::uuid ORDER BY updated_at DESC
  `);
  console.log('Vacating:', vr);

  const vrRow = await db.execute(sql`
    SELECT notice_given_date::text, vacating_date::text FROM vacating_requests WHERE id = ${VR_ID}::uuid
  `);
  const breakdown = await computeNoticeDeductionForBooking({
    bookingId: BOOKING_ID,
    noticeGivenDate: vrRow[0].notice_given_date as string,
    vacatingDate: vrRow[0].vacating_date as string,
    monthlyRentPaise: 500000,
  });
  console.log('Recomputed notice:', breakdown);
  console.log('Recomputed deduction:', paiseToInr(breakdown.noticeDeductionPaise));

  const drr = await db.execute(sql`
    SELECT id, type, status, payout_upi_id, payout_qr_url, use_average_billing_fallback
    FROM resident_requests WHERE booking_id = ${BOOKING_ID}::uuid
  `);
  console.log('Resident requests:', drr);

  const elecCount = await db.execute(sql`
    SELECT count(*)::int as c FROM electricity_invoices WHERE booking_id = ${BOOKING_ID}::uuid
  `);
  console.log('Electricity invoice count:', elecCount[0]?.c);

  await closeDb();
}
main();
