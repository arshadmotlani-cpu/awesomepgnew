#!/usr/bin/env npx tsx
/**
 * Repair missing deposit_ledger deductions for Harish APG-2026-0016 checkout.
 *
 * Audit:
 *   DATABASE_URL='postgres://…' npx tsx scripts/repair-harish-checkout-ledger.ts
 *
 * Apply fix:
 *   DATABASE_URL='postgres://…' npx tsx scripts/repair-harish-checkout-ledger.ts --execute
 */
import 'dotenv/config';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import {
  actionItems,
  checkoutSettlements,
  residentRequests,
} from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';
import {
  approveCheckoutSettlement,
  buildCheckoutSettlementDeductionPlan,
} from '@/src/services/checkoutSettlement';
import { applyDepositDeductionsInTx } from '@/src/services/depositSettlement';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

const EXECUTE = process.argv.includes('--execute');
const SETTLEMENT_ID = 'ce057827-df2a-4e39-acb9-0947fb05ee64';
const BOOKING_CODE = 'APG-2026-0016';
const SYSTEM_ADMIN = '00000000-0000-0000-0000-000000000001';

function ledgerHasDeduction(
  rows: Array<{ entry_kind: string; amount_paise: unknown; reason: unknown }>,
  amountPaise: number,
  hint: string,
): boolean {
  return rows.some(
    (r) =>
      r.entry_kind === 'deducted' &&
      Number(r.amount_paise) === -amountPaise &&
      String(r.reason).toLowerCase().includes(hint.toLowerCase()),
  );
}

async function main() {
  console.log('\n=== Harish checkout ledger repair ===\n');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'audit only'}\n`);

  const [settlement] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, SETTLEMENT_ID))
    .limit(1);

  if (!settlement) {
    console.error(`Settlement ${SETTLEMENT_ID} not found`);
    process.exit(1);
  }

  const [booking] = await db.execute(sql`
    SELECT b.id, b.booking_code, b.status, b.admin_deposit_refund_status, c.full_name
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.id = ${settlement.bookingId}::uuid
    LIMIT 1
  `);

  console.log('--- Settlement ---');
  console.table([
    {
      id: settlement.id,
      booking: booking?.booking_code ?? settlement.bookingId,
      status: settlement.status,
      amounts_locked: settlement.amountsLocked,
      notice: paiseToInr(settlement.noticeDeductionPaise),
      electricity: paiseToInr(settlement.electricitySharePaise),
      final_refund: settlement.finalRefundPaise != null ? paiseToInr(settlement.finalRefundPaise) : '(unset)',
    },
  ]);

  const ledger = await db.execute(sql`
    SELECT id, entry_kind, amount_paise, reason, created_at
    FROM deposit_ledger
    WHERE booking_id = ${settlement.bookingId}::uuid
    ORDER BY created_at ASC
  `);

  console.log('\n--- Deposit ledger (before) ---');
  for (const row of ledger) {
    console.log(
      `  ${row.entry_kind} ${paiseToInr(Number(row.amount_paise))} — ${String(row.reason).slice(0, 80)}`,
    );
  }

  const walletBefore = await getDepositSummaryForBooking(settlement.bookingId);
  console.log(`\nWallet balance: ${paiseToInr(walletBefore?.refundableBalancePaise ?? 0)}`);

  const plan = buildCheckoutSettlementDeductionPlan({
    noticeDeductionPaise: settlement.noticeDeductionPaise,
    noticeShortfallDays: settlement.noticeShortfallDays,
    electricitySharePaise: settlement.electricitySharePaise,
    electricityDeductFromDeposit: settlement.electricityDeductFromDeposit !== false,
    damageChargePaise: settlement.damageChargePaise,
    cleaningChargePaise: settlement.cleaningChargePaise,
    customChargePaise: settlement.customChargePaise,
    customChargeLabel: settlement.customChargeLabel,
  });

  const missing = plan.filter((d) => {
    const hint =
      d.reason.toLowerCase().includes('notice') ? 'notice' : d.reason.toLowerCase().includes('electric') ? 'electric' : d.reason.toLowerCase();
    return !ledgerHasDeduction(ledger, d.amountPaise, hint);
  });

  console.log('\n--- Missing ledger deductions ---');
  if (missing.length === 0) {
    console.log('  None — ledger matches settlement plan.');
  } else {
    for (const d of missing) {
      console.log(`  deduct ${paiseToInr(d.amountPaise)} — ${d.reason}`);
    }
  }

  if (!EXECUTE) {
    console.log('\nRe-run with --execute to apply missing deductions and complete checkout.');
    await closeDb();
    return;
  }

  if (missing.length > 0) {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM bookings WHERE id = ${settlement.bookingId} FOR UPDATE`,
      );
      await applyDepositDeductionsInTx(tx, {
        bookingId: settlement.bookingId,
        customerId: settlement.customerId,
        adminId: SYSTEM_ADMIN,
        relatedVacatingId: settlement.vacatingRequestId,
        deductions: missing,
      });
    });
    console.log('\n→ Applied missing deposit_ledger deductions.');
  }

  const refreshed = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, SETTLEMENT_ID))
    .limit(1);
  const current = refreshed[0] ?? settlement;

  if (!['completed', 'refund_paid'].includes(current.status)) {
    console.log('\n→ Completing checkout via approveCheckoutSettlement…');
    const approved = await approveCheckoutSettlement({
      settlementId: current.id,
      adminId: SYSTEM_ADMIN,
    });
    if (!approved.ok) {
      console.error('approveCheckoutSettlement failed:', approved.error);
      process.exit(1);
    }
    console.log('→ Checkout completed. finalRefundPaise:', paiseToInr(approved.finalRefundPaise));
  }

  await db
    .update(residentRequests)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(
      and(
        eq(residentRequests.bookingId, settlement.bookingId),
        eq(residentRequests.type, 'deposit_refund'),
        inArray(residentRequests.status, ['pending', 'approved', 'in_progress']),
      ),
    );

  await db
    .update(actionItems)
    .set({ status: 'resolved', updatedAt: new Date() })
    .where(
      and(
        inArray(actionItems.status, ['open', 'in_progress']),
        sql`(${actionItems.metadata}->>'bookingId' = ${settlement.bookingId}
          OR ${actionItems.metadata}->>'bookingCode' = ${BOOKING_CODE})`,
      ),
    );

  const walletAfter = await getDepositSummaryForBooking(settlement.bookingId);
  const ledgerAfter = await db.execute(sql`
    SELECT entry_kind, amount_paise, reason FROM deposit_ledger
    WHERE booking_id = ${settlement.bookingId}::uuid ORDER BY created_at ASC
  `);

  console.log('\n--- Deposit ledger (after) ---');
  for (const row of ledgerAfter) {
    console.log(
      `  ${row.entry_kind} ${paiseToInr(Number(row.amount_paise))} — ${String(row.reason).slice(0, 80)}`,
    );
  }
  console.log(`\nWallet balance: ${paiseToInr(walletAfter?.refundableBalancePaise ?? 0)}`);

  const [finalSettlement] = await db
    .select({ status: checkoutSettlements.status })
    .from(checkoutSettlements)
    .where(and(eq(checkoutSettlements.id, SETTLEMENT_ID), ne(checkoutSettlements.status, 'archived')))
    .limit(1);

  const ok =
    (walletAfter?.refundableBalancePaise ?? -1) === 0 &&
    ['completed', 'refund_paid'].includes(finalSettlement?.status ?? '');

  console.log(`\n${ok ? '✓ Repair complete' : '✗ Repair incomplete — review output above'}`);
  await closeDb();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
