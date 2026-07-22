/* eslint-disable no-console */
/**
 * Detect and repair booking checkout proof records on pg_payment_records.
 *
 * Fixes:
 * - Corrupt amount_paise (rent double-counted at submit)
 * - Missing proof snapshot columns
 * - Missing proof_snapshot_submitted_paise (non-ambiguous rows only)
 *
 * Usage:
 *   npx tsx scripts/repair-booking-payment-proof-snapshots.ts
 *   npx tsx scripts/repair-booking-payment-proof-snapshots.ts --apply
 *   npx tsx scripts/repair-booking-payment-proof-snapshots.ts --csv report.csv
 *   npx tsx scripts/repair-booking-payment-proof-snapshots.ts --ambiguous-csv ambiguous.csv
 *   npx tsx scripts/repair-booking-payment-proof-snapshots.ts --verify-migration
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
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
import {
  resolveVerifiedProofAmountPaise,
  shouldFreezeSubmittedSnapshotOnRepair,
} from '../src/lib/operations/paymentReviewProofAmount';
import { resolveLivePriorOutstandingForCheckout } from '../src/services/bookingPriorOutstanding';

const APPLY = process.argv.includes('--apply');
const VERIFY_MIGRATION = process.argv.includes('--verify-migration');
const csvArgIndex = process.argv.indexOf('--csv');
const ambiguousCsvIndex = process.argv.indexOf('--ambiguous-csv');
const CSV_PATH = csvArgIndex >= 0 ? process.argv[csvArgIndex + 1] : null;
const AMBIGUOUS_CSV_PATH =
  ambiguousCsvIndex >= 0 ? process.argv[ambiguousCsvIndex + 1] : null;

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
  submittedSnapshotPaise: number | null;
  action: 'repair_amount' | 'backfill' | 'ambiguous' | 'ok' | 'flag_approved_mismatch';
  reason: string;
};

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(path: string, rows: RepairRow[]) {
  const header =
    'record_id,booking_code,customer,status,amount_paise,verified_amount_paise,live_expected_paise,implied_prior_paise,snapshot_prior_paise,submitted_snapshot_paise,action,reason';
  const lines = rows.map((r) =>
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
      csvEscape(r.submittedSnapshotPaise),
      csvEscape(r.action),
      csvEscape(r.reason),
    ].join(','),
  );
  writeFileSync(path, [header, ...lines].join('\n'));
  console.log(`Wrote ${path}`);
}

async function verifyMigration0122() {
  const cols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pg_payment_records'
    ORDER BY ordinal_position
  `);
  const names = cols.map((c) => String((c as { column_name: string }).column_name));
  const exists = names.includes('proof_snapshot_submitted_paise');
  console.log(
    exists
      ? 'OK — migration 0122 column proof_snapshot_submitted_paise exists'
      : 'MISSING — run src/db/migrations/0122_proof_snapshot_submitted_paise.sql',
  );
  if (!exists) process.exitCode = 1;
}

async function main() {
  if (VERIFY_MIGRATION) {
    await verifyMigration0122();
    await closeDb();
    return;
  }

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
  let ambiguousCount = 0;
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
    } else if (resolution.isAmbiguousRepair) {
      action = 'ambiguous';
      reason =
        'Rent double-count without submitted snapshot — exact partial screenshot amount unknown; best-guess repair only';
      ambiguousCount += 1;
    } else if (amountCorrupt) {
      action = 'repair_amount';
      reason =
        resolution.repairReason === 'submitted_snapshot'
          ? 'Stored amount differs from frozen submit snapshot'
          : 'Corrupt amount_paise repaired to verified value';
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
      submittedSnapshotPaise: row.proofSnapshotSubmittedPaise,
      action,
      reason,
    });

    const shouldApply =
      action === 'repair_amount' || action === 'backfill' || action === 'ambiguous';

    if (shouldApply && APPLY) {
      const snapshot = inferProofSnapshotFromPaidAmount({
        amountPaise: verifiedAmountPaise,
        rentDuePaise: breakdown.rentDuePaise,
        depositDuePaise: breakdown.depositCashDuePaise,
        priorOutstandingItems: row.pricingSnapshot?.priorOutstanding?.items,
      });

      const snapshotFields = proofSnapshotRowValues(
        snapshot,
        shouldFreezeSubmittedSnapshotOnRepair(resolution, row.proofSnapshotSubmittedPaise)
          ? verifiedAmountPaise
          : (row.proofSnapshotSubmittedPaise ?? verifiedAmountPaise),
      );
      if (!shouldFreezeSubmittedSnapshotOnRepair(resolution, row.proofSnapshotSubmittedPaise)) {
        delete snapshotFields.proofSnapshotSubmittedPaise;
      }

      await db
        .update(pgPaymentRecords)
        .set({
          amountPaise: verifiedAmountPaise,
          ...snapshotFields,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pgPaymentRecords.id, row.recordId),
            eq(pgPaymentRecords.bookingId, row.bookingId),
          ),
        );

      if (action === 'repair_amount' || action === 'ambiguous') repaired += 1;
      else backfilled += 1;
    }
  }

  const actionable = report.filter((r) => r.action !== 'ok');
  const ambiguous = report.filter((r) => r.action === 'ambiguous');

  console.log(`Scanned ${report.length} booking payment records`);
  console.log(
    `Actionable: ${actionable.length} (repair/ambiguous: ${report.filter((r) => r.action === 'repair_amount' || r.action === 'ambiguous').length}, backfill: ${report.filter((r) => r.action === 'backfill').length}, ambiguous: ${ambiguousCount}, flagged approved: ${flagged})`,
  );
  if (APPLY) {
    console.log(`Repaired amounts: ${repaired}, backfilled snapshots: ${backfilled}`);
  } else {
    console.log('Dry run — pass --apply to write repairs');
  }

  if (CSV_PATH) writeCsv(CSV_PATH, report);
  if (AMBIGUOUS_CSV_PATH) writeCsv(AMBIGUOUS_CSV_PATH, ambiguous);

  for (const row of actionable.slice(0, 20)) {
    console.log(
      `- [${row.action}] ${row.bookingCode ?? row.bookingId} ${row.customerName}: stored ₹${(row.amountPaise / 100).toFixed(0)} → verified ₹${(row.verifiedAmountPaise / 100).toFixed(0)} — ${row.reason}`,
    );
  }
  if (actionable.length > 20) {
    console.log(`… and ${actionable.length - 20} more`);
  }

  if (ambiguous.length > 0) {
    console.log(`\nAmbiguous rows (exact screenshot amount not reconstructable): ${ambiguous.length}`);
    for (const row of ambiguous.slice(0, 10)) {
      console.log(
        `  · ${row.bookingCode ?? row.bookingId} stored ₹${(row.amountPaise / 100).toFixed(0)} → guess ₹${(row.verifiedAmountPaise / 100).toFixed(0)}`,
      );
    }
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
