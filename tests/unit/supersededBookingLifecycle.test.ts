/**
 * Superseded booking lifecycle — regression tests (Kunal APG-2026-0044 / 0045 scenario).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  isOpenBookingLifecycleStatus,
  isSupersededBookingStatus,
  isTerminalBookingLifecycleStatus,
} from '@/src/lib/booking/supersededBookingLifecycle';
import { deriveBookingApprovalPhase } from '@/src/lib/bookingApproval';
import {
  isBookingCheckoutEligibleForPaymentReview,
} from '@/src/lib/operations/paymentReviewSsot';
import { isBookingLifecycleCheckedOut } from '@/src/lib/checkout/checkoutSource';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('superseded booking lifecycle constants', () => {
  test('open lifecycle statuses are pre-confirmation only', () => {
    assert.equal(isOpenBookingLifecycleStatus('pending_approval'), true);
    assert.equal(isOpenBookingLifecycleStatus('confirmed'), false);
    assert.equal(isSupersededBookingStatus('superseded'), true);
    assert.equal(isTerminalBookingLifecycleStatus('superseded'), true);
  });

  test('superseded booking never eligible for payment review display', () => {
    assert.equal(isBookingCheckoutEligibleForPaymentReview('pending_approval'), true);
    assert.equal(isBookingCheckoutEligibleForPaymentReview('superseded'), false);
    assert.equal(isBookingCheckoutEligibleForPaymentReview('confirmed'), false);
  });

  test('superseded booking is lifecycle-checked-out for refund paths', () => {
    assert.equal(isBookingLifecycleCheckedOut({ bookingStatus: 'superseded' }), true);
  });

  test('booking approval phase treats superseded as inactive', () => {
    assert.equal(
      deriveBookingApprovalPhase({ status: 'superseded', hasPendingPaymentProof: true }),
      'inactive',
    );
  });
});

describe('superseded booking architecture wiring', () => {
  test('recordPaymentSuccess supersedes prior open bookings on confirm', () => {
    const lifecycle = read('src/services/bookingLifecycle.ts');
    assert.match(lifecycle, /supersedePriorOpenBookingsForConfirmedBooking/);
  });

  test('admin confirmed createBooking supersedes prior open bookings', () => {
    const booking = read('src/services/booking.ts');
    assert.match(booking, /supersedePriorOpenBookingsForConfirmedBooking/);
  });

  test('stale payment review SQL covers superseded status and newer confirmed/completed booking', () => {
    const ssot = read('src/lib/operations/paymentReviewSsot.ts');
    assert.match(ssot, /b\.status = 'superseded'/);
    assert.match(ssot, /FROM bookings newer/);
    assert.match(ssot, /newer\.status IN \('confirmed', 'completed'\)/);
  });

  test('qr payment review blocks ineligible superseded booking proofs', () => {
    const qr = read('src/services/qrPayments.ts');
    assert.match(qr, /!isBookingCheckoutEligibleForPaymentReview\(bookingRow\.status\)/);
  });

  test('migration backfills superseded open bookings without cron', () => {
    const migration = read('src/db/migrations/0103_supersede_orphan_open_bookings.sql');
    assert.match(migration, /status = 'superseded'/);
    assert.match(migration, /pg_payment_records/);
    assert.match(migration, /payment_review:qr-/);
  });
});

describe('Kunal scenario — pending older booking must not pass eligibility', () => {
  test('when newer booking is confirmed, older pending_approval is not actionable', () => {
    // Simulates APG-2026-0044 pending_approval after APG-2026-0045 confirmed:
    // eligibility filter alone still passes pending_approval — supersede + stale SQL must run.
    assert.equal(isBookingCheckoutEligibleForPaymentReview('pending_approval'), true);

    // After supersedeBooking marks 0044 superseded, queue must exclude it.
    assert.equal(isBookingCheckoutEligibleForPaymentReview('superseded'), false);

    // Stale SQL includes newer confirmed/completed branch as safety net before status flip.
    const ssot = read('src/lib/operations/paymentReviewSsot.ts');
    assert.match(ssot, /newer\.created_at > b\.created_at/);
    assert.match(ssot, /newer\.status IN \('confirmed', 'completed'\)/);
  });

  test('reconciliation supersedes orphan open bookings on queue load', () => {
    const recon = read('src/services/paymentReviewReconciliation.ts');
    assert.match(recon, /supersedeOrphanOpenBookingsWithNewerStay/);
  });

  test('booking approval sync excludes orphan open bookings superseded by newer stay', () => {
    const ops = read('src/services/unifiedOperationsQueue.ts');
    assert.match(ops, /openBookingRowSupersededByNewerAnchoredStaySql/);
    assert.match(ops, /not\(openBookingRowSupersededByNewerAnchoredStaySql\)/);
  });
});
