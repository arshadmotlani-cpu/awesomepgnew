/* eslint-disable no-console */
/**
 * Detect and repair booking checkout proof records on pg_payment_records.
 *
 * Fixes:
 * - Corrupt amount_paise (rent double-counted at submit)
 * - Missing proof snapshot columns
 * - Missing proof_snapshot_submitted_paise
 *
 * Usage:
 *   npx tsx scripts/repair-booking-payment-proof-snapshots.ts
 *   npx tsx scripts/repair-booking-payment-proof-snapshots.ts --apply
 *   npx tsx scripts/repair-booking-payment-proof-snapshots.ts --csv report.csv
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { and, eq, isNotNull } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings, customers, pgPaymentRecords } from '../src/db/schema';
import { breakdownBookingCheckoutPayment } from '../src/lib/billing/bookingCheckoutTotals';
import {
  buildBookingPaymentProofSnapshot,
  detectStalePriorOutstandingMismatch,
  inferProofSnapshotFromPaidAmount,
  proofSnapshotRowValues,
  resolveBookingProofExpectedCheckout,
} from '../src/lib/billing/bookingPaymentProofSnapshot';
import { resolveVerifiedProofAmountPaise } from '../src/lib/operations/paymentReviewProofAmount';
import { resolveLivePriorOutstandingForCheckout } from '../src/services/bookingPriorOutstanding';

const APPLY = process.argv.includes('--apply');
const csvArgIndex = process.argv.indexOf('--csv');
const CSV_PATH = csvArgIndex >= 0 ? process.argv[csvArgIndex + 1] : null;

type RepairRow = {
  recordId: string;
  bookingId: string;
  bookingCode: string | null;
  customerName: string;
  status: string;
  amountPaise: number;
  verifiedAmountPaise: number;
  liveExpectedPaise: number;
  impliedPriorPaise: number;
  snapshotPriorPaise: number | null;
  action: 'repair_amount' | 'backfill' | 'ok' | 'flag_approved_mismatch' | 'skip';
  reason: string;
};

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const rows = await db
    .select({
      recordId: pgPaymentRecords.id,
      bookingId: pgPaymentRecords.bookingId,
      bookingCode: bookings.bookingCode,
      customerName: customers.fullName,
      customerId: pgPaymentRecords.customerId,
      status: pgPaymentRecords.status,
      amountPaise: pgPaymentRecords.amountPaise,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
      proofSnapshotCheckoutTotalPaise: pgPaymentRecords.proofSnapshotCheckoutTotalPaise,
      proofSnapshotRentDuePaise: pgPaymentRecords.proofSnapshotRentDuePaise,
      proofSnapshotDepositDuePaise: pgPaymentRecords.proofSnapshotDepositDuePaise,
      proofSnapshotPriorOutstandingPaise: pgPaymentRecords.proofSnapshotPriorOutstandingPaise,
      proofSnapshotPriorOutstandingJson: pgPaymentRecords.proofSnapshotPriorOutstandingJson,
      proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
    })
    .from(pgPaymentRecords)
    .innerJoin(bookings, eq(bookings.id, pgPaymentRecords.bookingId))
    .innerJoin(customers, eq(customers.id, pgPaymentRecords.customerId))
    .where(isNotNull(pgPaymentRecords.bookingId));

  const report: RepairRow[] = [];
  let repaired = 0;
  let backfilled = 0;
  let flagged = 0;

  for (const row of rows) {
    if (!row.bookingId) continue;

    const breakdown = breakdownBookingCheckoutPayment({
      subtotalPaise: row.subtotalPaise,
      discountPaise: row.discountPaise,
      depositPaise: row.depositPaise,
      pricingSnapshot: row.pricingSnapshot,
    });

    const livePrior = await resolveLivePriorOutstandingForCheckout(
      row.customerId,
      row.bookingId,
    );

    const liveSnapshot = buildBookingPaymentProofSnapshot({
      rentDuePaise: breakdown.rentDuePaise,
      depositCashDuePaise: breakdown.depositCashDuePaise,
      priorOutstandingPaise: livePrior.totalPaise,
      priorOutstandingItems: livePrior.items,
    });

    const expected = resolveBookingProofExpectedCheckout(
      {
        status: row.status,
        proofSnapshotCheckoutTotalPaise: row.proofSnapshotCheckoutTotalPaise,
        proofSnapshotRentDuePaise: row.proofSnapshotRentDuePaise,
        proofSnapshotDepositDuePaise: row.proofSnapshotDepositDuePaise,
        proofSnapshotPriorOutstandingPaise: row.proofSnapshotPriorOutstandingPaise,
        proofSnapshotPriorOutstandingJson: row.proofSnapshotPriorOutstandingJson,
      },
      liveSnapshot,
    );

    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: row.amountPaise,
      proofSnapshotSubmittedPaise: row.proofSnapshotSubmittedPaise,
      rentDuePaise: expected.rentDuePaise,
      expectedCheckoutPaise: expected.checkoutTotalPaise,
    });

    const verifiedAmountPaise = resolution.verifiedAmountPaise;
    const liveExpected = expected.checkoutTotalPaise;

    const impliedPrior = Math.max(
      0,
      verifiedAmountPaise - breakdown.rentDuePaise - breakdown.depositCashDuePaise,
    );

    const staleMismatch = detectStalePriorOutstandingMismatch({
      amountPaise: verifiedAmountPaise,
      rentDuePaise: breakdown.rentDuePaise,
      depositDuePaise: breakdown.depositCashDuePaise,
      livePriorOutstandingPaise: livePrior.totalPaise,
      storedPriorOutstandingPaise: row.proofSnapshotPriorOutstandingPaise,
    });

    const missingSnapshot = row.proofSnapshotCheckoutTotalPaise == null;
    const missingSubmittedSnapshot = row.proofSnapshotSubmittedPaise == null;
    const amountCorrupt = resolution.shouldRepairStoredAmount;

    let action: RepairRow['action'] = 'ok';
    let reason = 'Proof amount and snapshots OK';

    if (row.status === 'approved' && staleMismatch) {
      action = 'flag_approved_mismatch';
      reason = 'Approved row may have misclassified prior slice as overpayment';
      flagged += 1;
    } else if (amountCorrupt) {
      action = 'repair_amount';
      reason =
        resolution.repairReason === 'rent_double_count'
          ? 'Rent double-counted in amount_paise — repair to verified screenshot amount'
          : 'Stored amount differs from frozen submit snapshot';
    } else if (missingSnapshot || missingSubmittedSnapshot || staleMismatch) {
      action = 'backfill';
      reason = missingSnapshot
        ? 'Missing proof snapshot columns'
        : missingSubmittedSnapshot
          ? 'Missing proof_snapshot_submitted_paise'
          : 'Live prior cleared but amount still includes prior slice';
    }

    report.push({
      recordId: row.recordId,
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      customerName: row.customerName,
      status: row.status,
      amountPaise: row.amountPaise,
      verifiedAmountPaise,
      liveExpectedPaise: liveExpected,
      impliedPriorPaise: impliedPrior,
      snapshotPriorPaise: row.proofSnapshotPriorOutstandingPaise,
      action,
      reason,
    });

    if ((action === 'repair_amount' || action === 'backfill') && APPLY) {
      const snapshot = inferProofSnapshotFromPaidAmount({
        amountPaise: verifiedAmountPaise,
        rentDuePaise: breakdown.rentDuePaise,
        depositDuePaise: breakdown.depositCashDuePaise,
        priorOutstandingItems: row.pricingSnapshot?.priorOutstanding?.items,
      });

      await db
        .update(pgPaymentRecords)
        .set({
          amountPaise: verifiedAmountPaise,
          ...proofSnapshotRowValues(snapshot, verifiedAmountPaise),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pgPaymentRecords.id, row.recordId),
            eq(pgPaymentRecords.bookingId, row.bookingId),
          ),
        );

      if (action === 'repair_amount') repaired += 1;
      else backfilled += 1;
    }
  }

  const actionable = report.filter((r) => r.action !== 'ok');
  console.log(`Scanned ${report.length} booking payment records`);
  console.log(
    `Actionable: ${actionable.length} (repair_amount: ${report.filter((r) => r.action === 'repair_amount').length}, backfill: ${report.filter((r) => r.action === 'backfill').length}, flagged approved: ${flagged})`,
  );
  if (APPLY) {
    console.log(`Repaired amounts: ${repaired}, backfilled snapshots: ${backfilled}`);
  } else {
    console.log('Dry run — pass --apply to write repairs');
  }

  if (CSV_PATH) {
    const header =
      'record_id,booking_code,customer,status,amount_paise,verified_amount_paise,live_expected_paise,implied_prior_paise,snapshot_prior_paise,action,reason';
    const lines = report.map((r) =>
      [
        csvEscape(r.recordId),
        csvEscape(r.bookingCode),
        csvEscape(r.customerName),
        csvEscape(r.status),
        csvEscape(r.amountPaise),
        csvEscape(r.verifiedAmountPaise),
        csvEscape(r.liveExpectedPaise),
        csvEscape(r.impliedPriorPaise),
        csvEscape(r.snapshotPriorPaise),
        csvEscape(r.action),
        csvEscape(r.reason),
      ].join(','),
    );
    writeFileSync(CSV_PATH, [header, ...lines].join('\n'));
    console.log(`Wrote ${CSV_PATH}`);
  }

  for (const row of actionable.slice(0, 20)) {
    console.log(
      `- [${row.action}] ${row.bookingCode ?? row.bookingId} ${row.customerName}: stored ₹${(row.amountPaise / 100).toFixed(0)} → verified ₹${(row.verifiedAmountPaise / 100).toFixed(0)} — ${row.reason}`,
    );
  }
  if (actionable.length > 20) {
    console.log(`… and ${actionable.length - 20} more`);
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
