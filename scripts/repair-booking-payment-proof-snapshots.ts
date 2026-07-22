/* eslint-disable no-console */
/**
 * Detect and backfill missing booking checkout proof snapshots on pg_payment_records.
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
import {
  breakdownBookingCheckoutPayment,
} from '../src/lib/billing/bookingCheckoutTotals';
import {
  detectStalePriorOutstandingMismatch,
  inferProofSnapshotFromPaidAmount,
  proofSnapshotRowValues,
} from '../src/lib/billing/bookingPaymentProofSnapshot';
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
  liveExpectedPaise: number;
  impliedPriorPaise: number;
  snapshotPriorPaise: number | null;
  action: 'backfill' | 'ok' | 'flag_approved_mismatch' | 'skip';
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
      proofSnapshotPriorOutstandingPaise: pgPaymentRecords.proofSnapshotPriorOutstandingPaise,
    })
    .from(pgPaymentRecords)
    .innerJoin(bookings, eq(bookings.id, pgPaymentRecords.bookingId))
    .innerJoin(customers, eq(customers.id, pgPaymentRecords.customerId))
    .where(isNotNull(pgPaymentRecords.bookingId));

  const report: RepairRow[] = [];
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

    const liveExpected =
      breakdown.rentDuePaise +
      breakdown.depositCashDuePaise +
      livePrior.totalPaise;

    const impliedPrior = Math.max(
      0,
      row.amountPaise - breakdown.rentDuePaise - breakdown.depositCashDuePaise,
    );

    const staleMismatch = detectStalePriorOutstandingMismatch({
      amountPaise: row.amountPaise,
      rentDuePaise: breakdown.rentDuePaise,
      depositDuePaise: breakdown.depositCashDuePaise,
      livePriorOutstandingPaise: livePrior.totalPaise,
      storedPriorOutstandingPaise: row.proofSnapshotPriorOutstandingPaise,
    });

    const missingSnapshot = row.proofSnapshotCheckoutTotalPaise == null;
    const snapshotMismatch =
      row.proofSnapshotCheckoutTotalPaise != null &&
      Math.abs(row.proofSnapshotCheckoutTotalPaise - row.amountPaise) > 100;

    let action: RepairRow['action'] = 'ok';
    let reason = 'Snapshot matches amount';

    if (row.status === 'approved' && staleMismatch) {
      action = 'flag_approved_mismatch';
      reason = 'Approved row may have misclassified prior slice as overpayment';
      flagged += 1;
    } else if (missingSnapshot || snapshotMismatch || staleMismatch) {
      action = 'backfill';
      reason = missingSnapshot
        ? 'Missing proof snapshot columns'
        : snapshotMismatch
          ? 'Snapshot checkout total differs from amount_paise'
          : 'Live prior cleared but amount still includes prior slice';
    }

    report.push({
      recordId: row.recordId,
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      customerName: row.customerName,
      status: row.status,
      amountPaise: row.amountPaise,
      liveExpectedPaise: liveExpected,
      impliedPriorPaise: impliedPrior,
      snapshotPriorPaise: row.proofSnapshotPriorOutstandingPaise,
      action,
      reason,
    });

    if (action === 'backfill' && APPLY) {
      const snapshot = inferProofSnapshotFromPaidAmount({
        amountPaise: row.amountPaise,
        rentDuePaise: breakdown.rentDuePaise,
        depositDuePaise: breakdown.depositCashDuePaise,
        priorOutstandingItems: row.pricingSnapshot?.priorOutstanding?.items,
      });
      await db
        .update(pgPaymentRecords)
        .set(proofSnapshotRowValues(snapshot))
        .where(
          and(
            eq(pgPaymentRecords.id, row.recordId),
            eq(pgPaymentRecords.bookingId, row.bookingId),
          ),
        );
      backfilled += 1;
    }
  }

  const actionable = report.filter((r) => r.action !== 'ok');
  console.log(`Scanned ${report.length} booking payment records`);
  console.log(`Actionable: ${actionable.length} (backfill: ${report.filter((r) => r.action === 'backfill').length}, flagged approved: ${flagged})`);
  if (APPLY) {
    console.log(`Backfilled: ${backfilled}`);
  } else {
    console.log('Dry run — pass --apply to write snapshots');
  }

  if (CSV_PATH) {
    const header =
      'record_id,booking_code,customer,status,amount_paise,live_expected_paise,implied_prior_paise,snapshot_prior_paise,action,reason';
    const lines = report.map((r) =>
      [
        csvEscape(r.recordId),
        csvEscape(r.bookingCode),
        csvEscape(r.customerName),
        csvEscape(r.status),
        csvEscape(r.amountPaise),
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
      `- [${row.action}] ${row.bookingCode ?? row.bookingId} ${row.customerName}: ₹${(row.amountPaise / 100).toFixed(0)} — ${row.reason}`,
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
