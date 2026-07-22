/* eslint-disable no-console */
/**
 * Inspect pending payment proof DB state + resolution for a booking.
 *
 * Usage:
 *   npx tsx scripts/diagnose-booking-proof-correction.ts --booking-code APG-2026-0082
 *   npx tsx scripts/diagnose-booking-proof-correction.ts --record-id <uuid>
 */
import 'dotenv/config';
import { and, desc, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { auditLog, bookings, pgPaymentRecords } from '../src/db/schema';
import { resolveVerifiedProofAmountPaise } from '../src/lib/operations/paymentReviewProofAmount';
import { buildBookingPaymentProofSnapshot } from '../src/lib/billing/bookingPaymentProofSnapshot';
import { breakdownBookingCheckoutPayment } from '../src/lib/billing/bookingCheckoutTotals';
import { getQrBookingPaymentReview } from '../src/services/qrPayments';

function readFlag(name: string): string {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? (process.argv[idx + 1] ?? '') : '';
}

const BOOKING_CODE = readFlag('--booking-code');
const RECORD_ID = readFlag('--record-id');

function inr(paise: number | null | undefined): string {
  if (paise == null) return '—';
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

async function main() {
  if (!BOOKING_CODE && !RECORD_ID) {
    console.error('Provide --booking-code or --record-id');
    process.exit(1);
  }

  let record:
    | {
        id: string;
        bookingId: string | null;
        status: string;
        amountPaise: number;
        proofSnapshotSubmittedPaise: number | null;
        proofSnapshotCheckoutTotalPaise: number | null;
        updatedAt: Date | null;
      }
    | undefined;

  try {
    if (RECORD_ID) {
      [record] = await db
        .select({
          id: pgPaymentRecords.id,
          bookingId: pgPaymentRecords.bookingId,
          status: pgPaymentRecords.status,
          amountPaise: pgPaymentRecords.amountPaise,
          proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
          proofSnapshotCheckoutTotalPaise: pgPaymentRecords.proofSnapshotCheckoutTotalPaise,
          updatedAt: pgPaymentRecords.updatedAt,
        })
        .from(pgPaymentRecords)
        .where(eq(pgPaymentRecords.id, RECORD_ID))
        .limit(1);
    } else {
      [record] = await db
        .select({
          id: pgPaymentRecords.id,
          bookingId: pgPaymentRecords.bookingId,
          status: pgPaymentRecords.status,
          amountPaise: pgPaymentRecords.amountPaise,
          proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
          proofSnapshotCheckoutTotalPaise: pgPaymentRecords.proofSnapshotCheckoutTotalPaise,
          updatedAt: pgPaymentRecords.updatedAt,
        })
        .from(pgPaymentRecords)
        .innerJoin(bookings, eq(pgPaymentRecords.bookingId, bookings.id))
        .where(
          and(eq(bookings.bookingCode, BOOKING_CODE), eq(pgPaymentRecords.status, 'pending')),
        )
        .limit(1);
    }
  } catch (err) {
    console.error('Query failed (migration 0122 missing?):', err);
    process.exit(1);
  }

  if (!record) {
    console.error('Pending payment record not found.');
    process.exit(1);
  }

  const [booking] = record.bookingId
    ? await db
        .select({
          bookingCode: bookings.bookingCode,
          subtotalPaise: bookings.subtotalPaise,
          discountPaise: bookings.discountPaise,
          depositPaise: bookings.depositPaise,
          pricingSnapshot: bookings.pricingSnapshot,
        })
        .from(bookings)
        .where(eq(bookings.id, record.bookingId))
        .limit(1)
    : [undefined];

  console.log('=== pg_payment_records ===');
  console.log('  record_id:', record.id);
  console.log('  booking:', booking?.bookingCode ?? record.bookingId);
  console.log('  status:', record.status);
  console.log('  amount_paise:', record.amountPaise, inr(record.amountPaise));
  console.log(
    '  proof_snapshot_submitted_paise:',
    record.proofSnapshotSubmittedPaise,
    inr(record.proofSnapshotSubmittedPaise),
  );
  console.log(
    '  proof_snapshot_checkout_total_paise:',
    record.proofSnapshotCheckoutTotalPaise,
    inr(record.proofSnapshotCheckoutTotalPaise),
  );
  console.log('  updated_at:', record.updatedAt?.toISOString() ?? '—');

  if (booking) {
    const breakdown = breakdownBookingCheckoutPayment(booking);
    const live = buildBookingPaymentProofSnapshot({
      rentDuePaise: breakdown.rentDuePaise,
      depositCashDuePaise: breakdown.depositCashDuePaise,
      priorOutstandingPaise: 0,
      priorOutstandingItems: [],
    });
    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: record.amountPaise,
      proofSnapshotSubmittedPaise: record.proofSnapshotSubmittedPaise,
      rentDuePaise: live.rentDuePaise,
      expectedCheckoutPaise: live.checkoutTotalPaise,
    });
    console.log('\n=== resolveVerifiedProofAmountPaise (live expected) ===');
    console.log('  live expected checkout:', inr(live.checkoutTotalPaise));
    console.log('  verified amount:', inr(resolution.verifiedAmountPaise));
    console.log('  should_repair_stored:', resolution.shouldRepairStoredAmount);
    console.log('  repair_reason:', resolution.repairReason);
    console.log('  ambiguous:', resolution.isAmbiguousRepair);
  }

  const review = await getQrBookingPaymentReview(record.id);
  console.log('\n=== getQrBookingPaymentReview (after self-heal) ===');
  if (review) {
    console.log('  verifiedProofAmountPaise:', inr(review.verifiedProofAmountPaise));
    console.log('  bookingTotalDuePaise:', inr(review.bookingTotalDuePaise));
  } else {
    console.log('  (null — booking context unavailable)');
  }

  const audits = await db
    .select({
      action: auditLog.action,
      diff: auditLog.diff,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'pg_payment_record'), eq(auditLog.entityId, record.id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(10);

  console.log('\n=== audit_log (latest 10) ===');
  if (audits.length === 0) {
    console.log('  (none — Save proof correction may never have run)');
  } else {
    for (const row of audits) {
      console.log(`  [${row.createdAt?.toISOString()}] ${row.action}`, JSON.stringify(row.diff));
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
