import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildBookingPaymentProofSnapshot,
  detectStalePriorOutstandingMismatch,
  inferProofSnapshotFromPaidAmount,
  isProofContaminatedExpectedSnapshot,
  resolveBookingProofExpectedCheckout,
  validateSubmittedAmountAgainstProofSnapshot,
} from '@/src/lib/billing/bookingPaymentProofSnapshot';

describe('bookingPaymentProofSnapshot', () => {
  test('freeze snapshot totals include prior outstanding', () => {
    const snapshot = buildBookingPaymentProofSnapshot({
      rentDuePaise: 66_000,
      depositCashDuePaise: 33_000,
      priorOutstandingPaise: 412_100,
      priorOutstandingItems: [
        { label: 'Prior deposit', amountPaise: 412_100, kind: 'deposit' },
      ],
    });
    assert.equal(snapshot.checkoutTotalPaise, 511_100);
  });

  test('pending review uses frozen snapshot not live fallback', () => {
    const live = buildBookingPaymentProofSnapshot({
      rentDuePaise: 66_000,
      depositCashDuePaise: 33_000,
      priorOutstandingPaise: 0,
      priorOutstandingItems: [],
    });
    const frozen = buildBookingPaymentProofSnapshot({
      rentDuePaise: 66_000,
      depositCashDuePaise: 33_000,
      priorOutstandingPaise: 412_100,
      priorOutstandingItems: [],
    });

    const resolved = resolveBookingProofExpectedCheckout(
      {
        status: 'pending',
        proofSnapshotCheckoutTotalPaise: frozen.checkoutTotalPaise,
        proofSnapshotRentDuePaise: frozen.rentDuePaise,
        proofSnapshotDepositDuePaise: frozen.depositDuePaise,
        proofSnapshotPriorOutstandingPaise: frozen.priorOutstandingPaise,
      },
      live,
    );

    assert.equal(resolved.checkoutTotalPaise, frozen.checkoutTotalPaise);
    assert.notEqual(resolved.checkoutTotalPaise, live.checkoutTotalPaise);
  });

  test('inferProofSnapshotFromPaidAmount matches immutable amount_paise', () => {
    const snapshot = inferProofSnapshotFromPaidAmount({
      amountPaise: 511_100,
      rentDuePaise: 66_000,
      depositDuePaise: 33_000,
    });
    assert.equal(snapshot.checkoutTotalPaise, 511_100);
    assert.equal(snapshot.priorOutstandingPaise, 412_100);
  });

  test('detectStalePriorOutstandingMismatch flags live prior cleared', () => {
    assert.equal(
      detectStalePriorOutstandingMismatch({
        amountPaise: 511_100,
        rentDuePaise: 66_000,
        depositDuePaise: 33_000,
        livePriorOutstandingPaise: 0,
      }),
      true,
    );
    assert.equal(
      detectStalePriorOutstandingMismatch({
        amountPaise: 99_000,
        rentDuePaise: 66_000,
        depositDuePaise: 33_000,
        livePriorOutstandingPaise: 0,
      }),
      false,
    );
  });

  test('validateSubmittedAmountAgainstProofSnapshot allows partial payment', () => {
    const snapshot = buildBookingPaymentProofSnapshot({
      rentDuePaise: 412_100,
      depositCashDuePaise: 412_100,
      priorOutstandingPaise: 0,
      priorOutstandingItems: [],
    });
    assert.equal(validateSubmittedAmountAgainstProofSnapshot(618_000, snapshot).ok, true);
  });

  test('validateSubmittedAmountAgainstProofSnapshot rejects rent double-count', () => {
    const snapshot = buildBookingPaymentProofSnapshot({
      rentDuePaise: 412_000,
      depositCashDuePaise: 412_000,
      priorOutstandingPaise: 0,
      priorOutstandingItems: [],
    });
    assert.equal(
      validateSubmittedAmountAgainstProofSnapshot(1_236_200, snapshot).ok,
      false,
    );
  });

  test('resolveBookingProofExpectedCheckout rejects proof-contaminated frozen snapshot', () => {
    const live = buildBookingPaymentProofSnapshot({
      rentDuePaise: 412_100,
      depositCashDuePaise: 412_100,
      priorOutstandingPaise: 0,
      priorOutstandingItems: [],
    });
    const contaminated = inferProofSnapshotFromPaidAmount({
      amountPaise: 1_236_200,
      rentDuePaise: 412_100,
      depositDuePaise: 412_100,
    });

    assert.equal(
      isProofContaminatedExpectedSnapshot({
        frozen: contaminated,
        live,
        storedProofAmountPaise: 1_236_200,
      }),
      true,
    );

    const resolved = resolveBookingProofExpectedCheckout(
      {
        status: 'pending',
        proofSnapshotCheckoutTotalPaise: contaminated.checkoutTotalPaise,
        proofSnapshotRentDuePaise: contaminated.rentDuePaise,
        proofSnapshotDepositDuePaise: contaminated.depositDuePaise,
        proofSnapshotPriorOutstandingPaise: contaminated.priorOutstandingPaise,
      },
      live,
      { storedProofAmountPaise: 1_236_200 },
    );

    assert.equal(resolved.checkoutTotalPaise, live.checkoutTotalPaise);
    assert.equal(resolved.rentDuePaise, 412_100);
  });
});
