import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  readingsMatch,
  validateContinuousPreviousReading,
} from '@/src/lib/billing/roomMeterReadingSsot';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';

describe('room meter reading SSOT', () => {
  test('previous reading must match last finalized monthly reading', () => {
    const ok = validateContinuousPreviousReading({
      providedPreviousUnits: 1000,
      expectedPreviousUnits: 1000,
    });
    assert.equal(ok.ok, true);

    const bad = validateContinuousPreviousReading({
      providedPreviousUnits: 1100,
      expectedPreviousUnits: 1000,
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.match(bad.message, /Move-out settlements do not change/);
      assert.match(bad.message, /1000/);
    }
  });

  test('override allowed only for repair backfills', () => {
    const result = validateContinuousPreviousReading({
      providedPreviousUnits: 900,
      expectedPreviousUnits: 1000,
      allowOverride: true,
    });
    assert.equal(result.ok, true);
  });

  test('decimal reading equality is stable to 2 places', () => {
    assert.equal(readingsMatch(1000.1, 1000.1), true);
    assert.equal(readingsMatch(1000.1, 1000.11), false);
    assert.equal(readingsMatch(1000.101, 1000.1), true);
  });
});

describe('monthly bill already-collected from move-out settlements', () => {
  test('resident A checkout credit reduces what remaining resident B pays', () => {
    // Room 1000→1200 = 200 units @ ₹4.5 = ₹900 (90_000 paise)
    // A already paid ₹450 (45_000) for 1000→1100 at move-out
    const result = allocateMonthlyElectricityInvoices({
      grossTotalPaise: 90_000,
      prepaidCreditPaise: 0,
      occupants: [
        { bookingId: 'a', customerId: 'resident-a', bedCount: 1, weight: 15 },
        { bookingId: 'b', customerId: 'resident-b', bedCount: 1, weight: 15 },
      ],
      checkoutCollectedByCustomerId: new Map([['resident-a', 45_000]]),
      useProRata: false,
      activeBedCount: 2,
    });

    assert.equal(result.checkoutCreditAppliedPaise, 45_000);
    assert.equal(result.netSplittablePaise, 45_000);
    const a = result.invoices.find((i) => i.customerId === 'resident-a');
    const b = result.invoices.find((i) => i.customerId === 'resident-b');
    assert.equal(a?.excludedBecauseCheckoutPaid, true);
    assert.equal(a?.amountPaise, 0);
    assert.equal(b?.amountPaise, 22_500);
  });
});
