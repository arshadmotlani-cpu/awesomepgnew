#!/usr/bin/env npx tsx
/**
 * Production verification + optional checkout completion for Manjusha Bhosale APG-2026-0017.
 *
 * Audit only:
 *   npx tsx scripts/verify-and-complete-manju-checkout.ts
 *
 * Complete checkout:
 *   npx tsx scripts/verify-and-complete-manju-checkout.ts --execute
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('verify-manju-checkout');

import { sql, eq, and, ne, desc } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { checkoutSettlements, actionItems } from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';
import { approveCheckoutSettlement } from '@/src/services/checkoutSettlement';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getResidentFinancialAccount } from '@/src/services/residentFinancialEngine';
import { finalizeVacatingOccupancy } from '@/src/services/vacating';

const EXECUTE = process.argv.includes('--execute');
const BOOKING_CODE = 'APG-2026-0017';
const BOOKING_ID = '04265c06-f998-4696-82d9-7b1934c7da35';
const CUSTOMER_ID = '3fe45658-bcf2-475a-8bd8-f3107a65e0c4';
const SYSTEM_ADMIN = '69b20ae4-657a-45ea-912a-04b0665e38f8';

type Check = { id: string; pass: boolean; detail: string };

async function main() {
  const checks: Check[] = [];

  const [booking] = await db.execute(sql`
    SELECT b.id, b.booking_code, b.status, b.admin_deposit_refund_status, c.full_name, c.residency_status
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.booking_code = ${BOOKING_CODE}
    LIMIT 1
  `);
  if (!booking) {
    console.error(`Booking ${BOOKING_CODE} not found`);
    process.exit(1);
  }

  const bookingId = BOOKING_ID;

  const financial = await getResidentFinancialAccount(CUSTOMER_ID);
  if (!financial) {
    console.error('No financial account for customer');
    process.exit(1);
  }
  console.log('\n=== Financial summary (SSOT) ===');
  console.log({
    outstanding: paiseToInr(financial.totals.outstandingPaise),
    rent: paiseToInr(financial.rent.outstandingPaise),
    electricity: paiseToInr(financial.electricity.outstandingPaise),
    deposit: paiseToInr(financial.deposit.outstandingPaise),
    other: paiseToInr(financial.other.outstandingPaise),
    totalsPaise: financial.totals.outstandingPaise,
  });

  checks.push({
    id: 'ZERO_BALANCE',
    pass: financial.totals.outstandingPaise <= 0,
    detail: `outstanding=${paiseToInr(financial.totals.outstandingPaise)}`,
  });

  const vacating = await db.execute(sql`
    SELECT id, status, vacating_date::text, deduction_paise, deposit_refund_paise
    FROM vacating_requests WHERE booking_id = ${bookingId}::uuid ORDER BY updated_at DESC
  `);
  console.log('\n=== Vacating requests ===');
  console.table(vacating);

  let [settlement] = await db
    .select()
    .from(checkoutSettlements)
    .where(
      and(eq(checkoutSettlements.bookingId, bookingId), ne(checkoutSettlements.status, 'archived')),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);

  if (!settlement) {
    console.log('\n=== No checkout settlement row ===');
    if (EXECUTE && booking.status === 'confirmed') {
      console.log('→ Attempting finalizeVacatingOccupancy (no settlement path)…');
      const vr = vacating[0];
      if (!vr) {
        console.error('No vacating request — cannot finalize');
        process.exit(1);
      }
      const result = await finalizeVacatingOccupancy({
        requestId: vr.id as string,
        resolvedByAdminId: SYSTEM_ADMIN,
      });
      if (!result.ok) {
        console.error('finalizeVacatingOccupancy failed:', result);
        process.exit(1);
      }
      console.log('→ finalizeVacatingOccupancy succeeded');
    }
  } else {
    const walletBefore = await getDepositSummaryForBooking(bookingId);
    const notice = settlement.noticeDeductionPaise;
    const elec = settlement.electricitySharePaise;
    const held = walletBefore?.refundableBalancePaise ?? settlement.depositRequiredPaise;
    const previewRefund = Math.max(
      0,
      held - notice - (settlement.electricityDeductFromDeposit ? elec : 0),
    );

    console.log('\n=== Checkout settlement ===');
    console.table([
      {
        id: settlement.id,
        status: settlement.status,
        deposit_held: paiseToInr(held),
        notice: paiseToInr(notice),
        electricity: paiseToInr(elec),
        preview_refund: paiseToInr(previewRefund),
        payout_upi: settlement.payoutUpiId ?? '(none)',
      },
    ]);

    if (
      EXECUTE &&
      !['completed', 'refund_paid', 'refund_pending'].includes(settlement.status)
    ) {
      console.log('\n→ Executing approveCheckoutSettlement…');
      const result = await approveCheckoutSettlement({
        settlementId: settlement.id,
        adminId: SYSTEM_ADMIN,
      });
      if (!result.ok) {
        console.error('approveCheckoutSettlement failed:', result.error);
        process.exit(1);
      }
      console.log('→ Approved. finalRefundPaise:', paiseToInr(result.finalRefundPaise));
      [settlement] = await db
        .select()
        .from(checkoutSettlements)
        .where(eq(checkoutSettlements.id, settlement.id))
        .limit(1);
    }
  }

  const [bed] = await db.execute(sql`
    SELECT br.status, r.room_number, bd.bed_code, p.name AS pg_name, br.stay_range::text
    FROM bed_reservations br
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE br.booking_id = ${bookingId}::uuid AND br.kind = 'primary'
    ORDER BY br.created_at DESC LIMIT 1
  `);

  const [bookingAfter] = await db.execute(sql`
    SELECT b.status, c.residency_status, b.admin_deposit_refund_status
    FROM bookings b JOIN customers c ON c.id = b.customer_id
    WHERE b.id = ${bookingId}::uuid
  `);

  const financialAfter = await getResidentFinancialAccount(CUSTOMER_ID);
  if (!financialAfter) {
    console.error('No financial account after action');
    process.exit(1);
  }

  console.log('\n=== Post-action state ===');
  console.table([
    {
      booking_status: bookingAfter?.status,
      residency: bookingAfter?.residency_status,
      deposit_refund_status: bookingAfter?.admin_deposit_refund_status,
      bed_status: bed?.status,
      room: bed ? `${bed.room_number}/${bed.bed_code}` : '—',
      outstanding: paiseToInr(financialAfter.totals.outstandingPaise),
      settlement_status: settlement?.status ?? '(none)',
    },
  ]);

  checks.push({
    id: 'BOOKING_COMPLETED',
    pass: bookingAfter?.status === 'completed',
    detail: `status=${bookingAfter?.status}`,
  });
  checks.push({
    id: 'BED_RELEASED',
    pass: bed?.status === 'completed' || bed?.status === 'cancelled',
    detail: `bed=${bed?.status}`,
  });
  checks.push({
    id: 'OUTSTANDING_ZERO',
    pass: financialAfter.totals.outstandingPaise <= 0,
    detail: paiseToInr(financialAfter.totals.outstandingPaise),
  });

  console.log('\n=== Checks ===');
  for (const c of checks) {
    console.log(c.pass ? '✓' : '✗', c.id, c.detail);
  }

  await closeDb();
  const failed = checks.filter((c) => !c.pass);
  if (failed.length && !EXECUTE) {
    console.log('\nRun with --execute to complete checkout if appropriate.');
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
