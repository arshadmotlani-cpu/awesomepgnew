#!/usr/bin/env npx tsx
/**
 * Production verification + optional Complete checkout for Harish APG-2026-0016.
 *
 * Audit only:
 *   DATABASE_URL='postgres://…' npx tsx scripts/verify-and-complete-harish-checkout.ts
 *
 * Complete checkout then verify:
 *   DATABASE_URL='postgres://…' npx tsx scripts/verify-and-complete-harish-checkout.ts --execute
 */
import 'dotenv/config';
import { sql, eq, and, ne, desc } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { checkoutSettlements, actionItems } from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';
import { approveCheckoutSettlement } from '@/src/services/checkoutSettlement';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

const EXECUTE = process.argv.includes('--execute');
const BOOKING_CODE = 'APG-2026-0016';
const SYSTEM_ADMIN = '00000000-0000-0000-0000-000000000001';

type Check = { id: string; pass: boolean; detail: string };

async function main() {
  const checks: Check[] = [];

  const [booking] = await db.execute(sql`
    SELECT b.id, b.booking_code, b.status, b.admin_deposit_refund_status, c.full_name
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.booking_code = ${BOOKING_CODE}
    LIMIT 1
  `);
  if (!booking) {
    console.error(`Booking ${BOOKING_CODE} not found`);
    process.exit(1);
  }

  const bookingId = booking.id as string;

  let [settlement] = await db
    .select()
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.bookingId, bookingId),
        ne(checkoutSettlements.status, 'archived'),
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);

  if (!settlement) {
    console.error('No checkout settlement found');
    process.exit(1);
  }

  const walletBefore = await getDepositSummaryForBooking(bookingId);
  const notice = settlement.noticeDeductionPaise;
  const elec = settlement.electricitySharePaise;
  const held = walletBefore?.refundableBalancePaise ?? settlement.depositRequiredPaise;
  const previewRefund = Math.max(
    0,
    held - notice - (settlement.electricityDeductFromDeposit ? elec : 0),
  );

  console.log('\n=== Pre-action state ===');
  console.table([
    {
      resident: booking.full_name,
      booking: BOOKING_CODE,
      settlement_status: settlement.status,
      deposit_held: paiseToInr(held),
      notice: paiseToInr(notice),
      electricity: paiseToInr(elec),
      preview_refund: paiseToInr(previewRefund),
    },
  ]);

  if (EXECUTE && !['completed', 'refund_paid'].includes(settlement.status)) {
    console.log('\n→ Executing approveCheckoutSettlement (Complete checkout)…');
    const result = await approveCheckoutSettlement({
      settlementId: settlement.id,
      adminId: SYSTEM_ADMIN,
    });
    if (!result.ok) {
      console.error('Complete checkout failed:', result.error);
      process.exit(1);
    }
    console.log('→ Approved. finalRefundPaise:', paiseToInr(result.finalRefundPaise));
    [settlement] = await db
      .select()
      .from(checkoutSettlements)
      .where(eq(checkoutSettlements.id, settlement.id))
      .limit(1);
  }

  const wallet = await getDepositSummaryForBooking(bookingId);
  const ledger = await db.execute(sql`
    SELECT entry_kind, amount_paise, reason FROM deposit_ledger
    WHERE booking_id = ${bookingId}::uuid ORDER BY created_at ASC
  `);

  const noticeEntry = ledger.find(
    (r) =>
      r.entry_kind === 'deducted' &&
      Number(r.amount_paise) === -notice &&
      String(r.reason).toLowerCase().includes('notice'),
  );
  const elecEntry = ledger.find(
    (r) =>
      r.entry_kind === 'deducted' &&
      Number(r.amount_paise) === -elec &&
      String(r.reason).toLowerCase().includes('electric'),
  );

  const [bed] = await db.execute(sql`
    SELECT br.status, r.room_number, bd.bed_code, p.name AS pg_name
    FROM bed_reservations br
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE br.booking_id = ${bookingId}::uuid AND br.kind = 'primary'
    ORDER BY br.created_at DESC LIMIT 1
  `);

  const [vacating] = await db.execute(sql`
    SELECT status FROM vacating_requests WHERE booking_id = ${bookingId}::uuid
    ORDER BY created_at DESC LIMIT 1
  `);

  const openItems = await db
    .select({ id: actionItems.id, type: actionItems.type, status: actionItems.status })
    .from(actionItems)
    .where(
      sql`${actionItems.status} IN ('open', 'in_progress')
        AND (${actionItems.metadata}->>'bookingId' = ${bookingId}
          OR ${actionItems.metadata}->>'bookingCode' = ${BOOKING_CODE})`,
    );

  const inVacatingQueue = await db.execute(sql`
    SELECT 1 FROM vacating_requests vr
    WHERE vr.booking_id = ${bookingId}::uuid AND vr.status = 'approved' LIMIT 1
  `);

  const inCheckoutPending = settlement.status === 'awaiting_resident_details' ||
    settlement.status === 'awaiting_admin_review';

  // A. Checkout
  checks.push({
    id: 'A1',
    pass: settlement.status === 'completed',
    detail: `status=${settlement.status}`,
  });
  checks.push({
    id: 'A2',
    pass: settlement.status !== 'awaiting_resident_details',
    detail: 'not waiting on resident',
  });
  checks.push({
    id: 'A3',
    pass: previewRefund <= 0 || Boolean(settlement.payoutUpiId || settlement.payoutQrUrl),
    detail: 'UPI not required when refund=0',
  });

  // B. Ledger
  checks.push({
    id: 'B1',
    pass: Boolean(noticeEntry) || notice === 0,
    detail: noticeEntry ? `notice deducted ${paiseToInr(notice)}` : 'notice entry missing',
  });
  checks.push({
    id: 'B2',
    pass: Boolean(elecEntry) || elec === 0,
    detail: elecEntry ? `electricity deducted ${paiseToInr(elec)}` : 'electricity entry missing',
  });
  checks.push({
    id: 'B3',
    pass: (wallet?.refundableBalancePaise ?? -1) === 0,
    detail: `net balance ${paiseToInr(wallet?.refundableBalancePaise ?? 0)}`,
  });

  // C. Bed
  const bedReleased =
    !bed ||
    ['completed', 'cancelled'].includes(String(bed.status)) ||
    String(bed.status) !== 'active';
  checks.push({
    id: 'C1',
    pass: bedReleased,
    detail: bed
      ? `${bed.pg_name} R${bed.room_number} ${bed.bed_code} status=${bed.status}`
      : 'no primary reservation',
  });

  // D. Resident lifecycle
  checks.push({
    id: 'D1',
    pass: vacating?.status === 'completed' || settlement.status === 'completed',
    detail: `vacating=${vacating?.status ?? 'none'}`,
  });
  checks.push({
    id: 'D2',
    pass: openItems.length === 0,
    detail: openItems.length ? `${openItems.length} open action items` : 'no open action items',
  });

  // E. Admin queues
  checks.push({
    id: 'E1',
    pass: inVacatingQueue.length === 0,
    detail: inVacatingQueue.length ? 'still in vacating queue' : 'not in vacating queue',
  });
  checks.push({
    id: 'E2',
    pass: settlement.status !== 'refund_pending',
    detail: 'not in refund pending',
  });
  checks.push({
    id: 'E3',
    pass: !inCheckoutPending,
    detail: inCheckoutPending ? 'still checkout pending' : 'not checkout pending',
  });

  console.log('\n=== Verification checklist ===');
  for (const c of checks) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`);
  }

  console.log('\n=== Ledger ===');
  for (const row of ledger) {
    console.log(`  ${row.entry_kind} ${paiseToInr(Number(row.amount_paise))} — ${row.reason}`);
  }

  const allPass = checks.every((c) => c.pass);
  console.log(`\n${allPass ? '✓ ALL CHECKS PASS' : '✗ VERIFICATION FAILED'}`);
  if (!EXECUTE && settlement.status !== 'completed') {
    console.log('\nRe-run with --execute to Complete checkout then verify.');
  }

  await closeDb();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
