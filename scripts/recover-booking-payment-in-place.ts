/* eslint-disable no-console */
/**
 * One-time in-place recovery for a historical booking payment proof.
 *
 * Sets verified screenshot amount + allocation on a pending pg_payment_record,
 * optionally approves with explicit rent/deposit split.
 *
 * Usage:
 *   npx tsx scripts/recover-booking-payment-in-place.ts --booking-code BK-XXXX
 *   npx tsx scripts/recover-booking-payment-in-place.ts --booking-code BK-XXXX --apply
 *   npx tsx scripts/recover-booking-payment-in-place.ts --record-id <uuid> --apply --approve
 *
 * Defaults (override with flags):
 *   --amount 6180 --rent 4121 --deposit 2059
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings, pgPaymentRecords } from '../src/db/schema';
import {
  correctPendingPaymentProofAmount,
  projectBalancesAfterAllocation,
} from '../src/services/paymentProofCorrection';
import { breakdownBookingCheckoutPayment } from '../src/lib/billing/bookingCheckoutTotals';
import { guardDepositPaise } from '../src/lib/deposits/paiseSafety';

const APPLY = process.argv.includes('--apply');
const APPROVE = process.argv.includes('--approve');

function readFlag(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? (process.argv[idx + 1] ?? fallback) : fallback;
}

const BOOKING_CODE = readFlag('--booking-code', '');
const RECORD_ID = readFlag('--record-id', '');
const AMOUNT_RUPEES = Number(readFlag('--amount', '6180'));
const RENT_RUPEES = Number(readFlag('--rent', '4121'));
const DEPOSIT_RUPEES = Number(readFlag('--deposit', '2059'));
const ADMIN_ID = readFlag('--admin-id', 'recovery-script');

function rupeesToPaise(r: number): number {
  return Math.round(r * 100);
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
      }
    | undefined;

  if (RECORD_ID) {
    [record] = await db
      .select({
        id: pgPaymentRecords.id,
        bookingId: pgPaymentRecords.bookingId,
        status: pgPaymentRecords.status,
        amountPaise: pgPaymentRecords.amountPaise,
        proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
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
      })
      .from(pgPaymentRecords)
      .innerJoin(bookings, eq(pgPaymentRecords.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.bookingCode, BOOKING_CODE),
          eq(pgPaymentRecords.status, 'pending'),
        ),
      )
      .limit(1);
  }

  if (!record?.bookingId) {
    console.error('Pending payment record not found.');
    process.exit(1);
  }

  const [booking] = await db
    .select({
      bookingCode: bookings.bookingCode,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, record.bookingId))
    .limit(1);

  const confirmedReceivedPaise = rupeesToPaise(AMOUNT_RUPEES);
  const rentAllocatedPaise = rupeesToPaise(RENT_RUPEES);
  const depositAllocatedPaise = rupeesToPaise(DEPOSIT_RUPEES);

  if (rentAllocatedPaise + depositAllocatedPaise !== confirmedReceivedPaise) {
    console.error('Rent + deposit must equal proof amount.');
    process.exit(1);
  }

  const breakdown = breakdownBookingCheckoutPayment(booking!);
  const depositRequired = guardDepositPaise(
    breakdown.depositCashDuePaise,
    'recovery.depositRequired',
  );
  const projected = projectBalancesAfterAllocation({
    rentRequiredPaise: breakdown.rentDuePaise,
    depositRequiredPaise: depositRequired,
    rentAllocatedPaise,
    depositAllocatedPaise,
  });

  console.log('Recovery plan');
  console.log('  booking:', booking?.bookingCode);
  console.log('  record:', record.id);
  console.log('  status:', record.status);
  console.log('  stored amount:', record.amountPaise / 100);
  console.log('  submitted snapshot:', (record.proofSnapshotSubmittedPaise ?? 0) / 100);
  console.log('  verified amount:', AMOUNT_RUPEES);
  console.log('  rent received:', RENT_RUPEES);
  console.log('  deposit received:', DEPOSIT_RUPEES);
  console.log('  projected rent outstanding:', projected.rent.outstandingPaise / 100);
  console.log('  projected deposit outstanding:', projected.deposit.outstandingPaise / 100);

  if (!APPLY) {
    console.log('\nDry run — pass --apply to write proof correction.');
    if (APPROVE) console.log('Pass --apply with --approve to approve after correction.');
    return;
  }

  const correction = await correctPendingPaymentProofAmount({
    recordId: record.id,
    verifiedAmountPaise: confirmedReceivedPaise,
    adminId: ADMIN_ID,
    reason: 'Historical in-place recovery script',
  });
  if (!correction.ok) {
    console.error('Correction failed:', correction.reason);
    process.exit(1);
  }
  console.log('\nProof corrected:', correction.previousAmountPaise / 100, '→', correction.verifiedAmountPaise / 100);

  if (APPROVE) {
    console.log('\n--approve requires admin session; use Payment Review UI to approve with allocation.');
    console.log('Open /admin/payment-review and approve with the saved allocation.');
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
