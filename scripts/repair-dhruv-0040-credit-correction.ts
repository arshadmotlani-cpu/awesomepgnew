#!/usr/bin/env npx tsx
/**
 * One-time accounting correction: reverse misclassified Dhruv wallet credit.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-dhruv-0040-credit-correction.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-dhruv-0040-credit-correction.ts --execute
 */
import { and, eq, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-dhruv-0040-credit-correction.ts');

import { closeDb, db } from '@/src/db/client';
import {
  adminUsers,
  auditLog,
  bookings,
  depositLedger,
  electricityInvoices,
  paymentApprovalAllocations,
  payments,
  pgPaymentRecords,
  rentInvoices,
  residentCreditLedger,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { getDepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';
import { paiseToInr } from '@/src/lib/format';
import { applyBookingOverpaymentDisposition } from '@/src/services/bookingOverpayment';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { dailyRateFromMonthly } from '@/src/services/billing';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { applyElectricityAllocationForBooking } from '@/src/services/paymentAllocation';
import {
  getResidentCreditBalance,
  recordResidentCreditDebit,
} from '@/src/services/residentCreditLedger';

const execute = process.argv.includes('--execute');

const CUSTOMER_ID = '3cd0d0cb-5f4c-4fd9-ae8b-780664e61f1c';
const BOOKING_0040_ID = '70debd82-4c80-4fd7-a368-0cd7c40f7fbd';
const BOOKING_0040_CODE = 'APG-2026-0040';
const PENDING_RECORD_ID = '150bc21b-8058-491c-be98-3772a9e06470';
const DHRUV_ELEC_INVOICE_ID = '6d8d46c3-115d-4a12-a4c3-808774e60473';
const PAYMENT_REF = `qr_record_${PENDING_RECORD_ID}`;

const ORIGINAL_CREDIT_PAISE = 565_720;
const ELEC_ALLOC_PAISE = 67_016;
const REFUND_PENDING_PAISE = 498_704;
const CHECKOUT_DATE = '2026-08-03';

async function findAdmin() {
  const fromEnv = process.env.REPAIR_ADMIN_ID?.trim();
  if (fromEnv) {
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, fromEnv)).limit(1);
    if (row) return row;
  }
  const [row] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.role, 'super_admin'), eq(adminUsers.isActive, true)))
    .limit(1);
  if (!row) throw new Error('No super_admin found. Set REPAIR_ADMIN_ID.');
  return row;
}

function refundPendingFromSnapshot(snapshot: PricingSnapshot | null | undefined): number {
  return (snapshot?.checkoutCredits ?? [])
    .filter((c) => c.kind === 'refund_pending' && c.relatedPaymentId === PAYMENT_REF)
    .reduce((sum, c) => sum + Math.max(0, c.amountPaise), 0);
}

async function loadDepositLedgerTotal(): Promise<number> {
  const rows = await db
    .select({ amountPaise: depositLedger.amountPaise })
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, BOOKING_0040_ID));
  return rows.reduce((sum, r) => sum + Number(r.amountPaise), 0);
}

async function verifyPostState(adminId: string) {
  const credit = await getResidentCreditBalance(CUSTOMER_ID);
  const [elec] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, DHRUV_ELEC_INVOICE_ID))
    .limit(1);
  const [booking] = await db
    .select({ pricingSnapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, BOOKING_0040_ID))
    .limit(1);
  const snapshot = (booking?.pricingSnapshot ?? {}) as PricingSnapshot;
  const refundPending = refundPendingFromSnapshot(snapshot);
  const dep = await getDepositSummaryForBooking(BOOKING_0040_ID);
  const depPreview = await getDepositRefundSettlementPreview(BOOKING_0040_ID);
  const bal = await getBookingMoneyBalances(BOOKING_0040_ID);
  const monthlyRent = 412_080;

  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-01',
    stayCheckoutDate: CHECKOUT_DATE,
    rentPaidPaise: bal?.rent.receivedPaise ?? 0,
    monthlyRentPaise: monthlyRent,
    depositCollectedPaise: dep?.refundableBalancePaise ?? 0,
    missingNoticeDays: 0,
    electricityPaise: 0,
    electricityDeductFromDeposit: true,
    noticeApplies: true,
  });

  const paymentRows = await db.execute(sql`
    SELECT amount_paise, purpose, provider_payment_id, paid_at
    FROM payments
    WHERE booking_id = ${BOOKING_0040_ID} AND status = 'succeeded'
    ORDER BY paid_at
  `);

  const pendingPg = await db
    .select({ status: pgPaymentRecords.status, amountPaise: pgPaymentRecords.amountPaise })
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.id, PENDING_RECORD_ID))
    .limit(1);

  const creditEntries = await db
    .select()
    .from(residentCreditLedger)
    .where(eq(residentCreditLedger.customerId, CUSTOMER_ID));

  console.log('\n=== POST-CORRECTION VERIFICATION ===');
  console.log('Credit ledger balance:', paiseToInr(credit), `(expect ₹0)`);
  console.log('Credit ledger entries:', creditEntries.length);
  for (const e of creditEntries) {
    console.log(`  ${e.entryKind} ${paiseToInr(e.amountPaise)} — ${e.reason.slice(0, 80)}`);
  }
  console.log('July elec status:', elec?.status, 'paid', paiseToInr(elec?.paidPaise ?? 0));
  console.log('Refund pending (snapshot):', paiseToInr(refundPending), `(expect ₹4,987.04)`);
  console.log('Deposit held:', paiseToInr(dep?.refundableBalancePaise ?? 0));
  console.log('Deposit ledger net sum:', paiseToInr(await loadDepositLedgerTotal()));
  console.log('Deposit preview (no elec deduct):', paiseToInr(depPreview.refundAmountPaise ?? 0));
  console.log('Checkout V2 total refund (elec already paid):', paiseToInr(waterfall.refund.totalPaise));
  console.log('  unused rent portion:', paiseToInr(waterfall.refund.unusedRentPortionPaise));
  console.log('  deposit portion:', paiseToInr(waterfall.refund.depositPortionPaise));
  console.log('PG payment record:', pendingPg[0]?.status, paiseToInr(pendingPg[0]?.amountPaise ?? 0));

  let totalCash = 0;
  console.log('\nPayments (0040):');
  for (const p of paymentRows) {
    const row = p as { amount_paise: string; purpose: string; provider_payment_id: string; paid_at: string };
    const amt = Number(row.amount_paise);
    totalCash += amt;
    console.log(`  ${row.paid_at} ${paiseToInr(amt)} ${row.purpose} ${row.provider_payment_id.slice(0, 45)}`);
  }

  const rentConsumed = waterfall.rentBucket.consumedPaise;
  const elecRetained = ELEC_ALLOC_PAISE;
  const depositHeld = dep?.refundableBalancePaise ?? 0;
  const checkoutRefund = waterfall.refund.totalPaise;
  const totalLiabilities = depositHeld + checkoutRefund + refundPending;
  const accountingBalance = totalCash - rentConsumed - elecRetained - totalLiabilities;

  console.log('\n=== RECONCILIATION (accounting) ===');
  console.log('Cash received (payments table):', paiseToInr(totalCash));
  console.log('− Rent retained (34 stay-days):', paiseToInr(rentConsumed));
  console.log('− Electricity retained (July):', paiseToInr(elecRetained));
  console.log('− Deposit held (escrow):', paiseToInr(depositHeld));
  console.log('− Checkout refund liability (if leaves ~Aug 3):', paiseToInr(checkoutRefund));
  console.log('  (unused rent + full deposit — elec already paid)');
  console.log('− Overpayment refund pending:', paiseToInr(refundPending));
  console.log('= Residual (expect ₹0):', paiseToInr(accountingBalance));

  const augProof = 977_800;
  const julPayment = 824_160;
  const realCash = augProof + julPayment;
  console.log('\n=== RECONCILIATION (resident real cash) ===');
  console.log('Real cash (Jul UPI + Aug proof):', paiseToInr(realCash));
  console.log('− Rent retained:', paiseToInr(rentConsumed));
  console.log('− Electricity retained:', paiseToInr(elecRetained));
  console.log('− Deposit held:', paiseToInr(depositHeld));
  console.log('− Checkout refund liability:', paiseToInr(checkoutRefund));
  console.log('− Overpayment refund pending:', paiseToInr(refundPending));
  console.log(
    '= Residual:',
    paiseToInr(realCash - rentConsumed - elecRetained - depositHeld - checkoutRefund - refundPending),
  );

  const failures: string[] = [];
  if (credit !== 0) failures.push(`credit balance ${credit} != 0`);
  if (elec?.status !== 'paid' || (elec?.paidPaise ?? 0) !== ELEC_ALLOC_PAISE) {
    failures.push(`elec not fully paid (${elec?.status} ${elec?.paidPaise})`);
  }
  if (refundPending !== REFUND_PENDING_PAISE) {
    failures.push(`refund pending ${refundPending} != ${REFUND_PENDING_PAISE}`);
  }

  if (failures.length > 0) {
    throw new Error(`Verification failed: ${failures.join('; ')}`);
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: adminId,
    entity: 'booking',
    entityId: BOOKING_0040_ID,
    action: 'dhruv_0040_credit_correction_verified',
    diff: {
      creditBalancePaise: credit,
      elecPaidPaise: elec?.paidPaise,
      refundPendingPaise: refundPending,
      depositHeldPaise: depositHeld,
      checkoutRefundPaise: checkoutRefund,
    },
  });
}

async function main() {
  const admin = await findAdmin();
  const creditBefore = await getResidentCreditBalance(CUSTOMER_ID);
  const depositLedgerBefore = await loadDepositLedgerTotal();
  const [elecBefore] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, DHRUV_ELEC_INVOICE_ID))
    .limit(1);
  const [bookingBefore] = await db
    .select({ pricingSnapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, BOOKING_0040_ID))
    .limit(1);

  console.log('\n=== Dhruv 0040 credit correction ===');
  console.log('Execute:', execute);
  console.log('Credit before:', paiseToInr(creditBefore));
  console.log('Elec before:', elecBefore?.status, paiseToInr(elecBefore?.paidPaise ?? 0));
  console.log(
    'Refund pending before:',
    paiseToInr(refundPendingFromSnapshot(bookingBefore?.pricingSnapshot as PricingSnapshot)),
  );
  console.log('Deposit ledger net before:', paiseToInr(depositLedgerBefore));

  if (!execute) {
    console.log('\nDry run — pass --execute to apply.');
    await closeDb();
    return;
  }

  if (creditBefore > 0) {
    await recordResidentCreditDebit({
      customerId: CUSTOMER_ID,
      bookingId: BOOKING_0040_ID,
      amountPaise: creditBefore,
      reason: `Dhruv 0040 accounting correction — reverse misclassified wallet credit (${PAYMENT_REF})`,
      createdByAdminId: admin.id,
    });
    console.log('Reversed credit:', paiseToInr(creditBefore));
  } else {
    console.log('Credit already zero — skip reversal');
  }

  const [elecMid] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, DHRUV_ELEC_INVOICE_ID))
    .limit(1);

  if ((elecMid?.paidPaise ?? 0) < ELEC_ALLOC_PAISE) {
    const elecResult = await applyElectricityAllocationForBooking({
      bookingId: BOOKING_0040_ID,
      paymentId: PAYMENT_REF,
      amountPaise: ELEC_ALLOC_PAISE,
      approvedByAdminId: admin.id,
    });
    if (!elecResult.ok) throw new Error(`Electricity allocation failed: ${elecResult.reason}`);
    console.log('Allocated electricity:', paiseToInr(ELEC_ALLOC_PAISE));
  } else {
    console.log('Electricity already allocated — skip');
  }

  const [bookingMid] = await db
    .select({ pricingSnapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, BOOKING_0040_ID))
    .limit(1);
  const existingRefund = refundPendingFromSnapshot(bookingMid?.pricingSnapshot as PricingSnapshot);

  if (existingRefund < REFUND_PENDING_PAISE) {
    const toPost = REFUND_PENDING_PAISE - existingRefund;
    const refundResult = await applyBookingOverpaymentDisposition({
      bookingId: BOOKING_0040_ID,
      bookingCode: BOOKING_0040_CODE,
      customerId: CUSTOMER_ID,
      paymentId: PAYMENT_REF,
      excessPaise: toPost,
      disposition: 'refund_later',
      approvedByAdminId: admin.id,
    });
    console.log('Posted refund_pending:', paiseToInr(toPost), refundResult);
  } else {
    console.log('Refund pending already recorded — skip');
  }

  const [alloc] = await db
    .select()
    .from(paymentApprovalAllocations)
    .where(
      and(
        eq(paymentApprovalAllocations.entityType, 'pg_payment_record'),
        eq(paymentApprovalAllocations.entityId, PENDING_RECORD_ID),
      ),
    )
    .limit(1);

  if (alloc) {
    await db
      .update(paymentApprovalAllocations)
      .set({
        electricityPaidPaise: ELEC_ALLOC_PAISE,
        otherPaidPaise: 0,
        allocationNotes:
          'Dhruv 0040 correction — rent ₹4120.80 + elec ₹670.16 + refund pending ₹4987.04 from ₹9778 proof',
        approvedAt: new Date(),
      })
      .where(eq(paymentApprovalAllocations.id, alloc.id));
    console.log('Updated payment approval allocation snapshot');
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: admin.id,
    entity: 'booking',
    entityId: BOOKING_0040_ID,
    action: 'dhruv_0040_credit_correction',
    diff: {
      paymentRef: PAYMENT_REF,
      reversedCreditPaise: creditBefore,
      electricityAllocatedPaise: ELEC_ALLOC_PAISE,
      refundPendingPaise: REFUND_PENDING_PAISE,
      depositLedgerUnchanged: depositLedgerBefore,
    },
  });

  const depositLedgerAfter = await loadDepositLedgerTotal();
  if (depositLedgerAfter !== depositLedgerBefore) {
    throw new Error(
      `Deposit ledger changed: before ${depositLedgerBefore} after ${depositLedgerAfter}`,
    );
  }

  await verifyPostState(admin.id);
  console.log('\nCorrection complete.');
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
