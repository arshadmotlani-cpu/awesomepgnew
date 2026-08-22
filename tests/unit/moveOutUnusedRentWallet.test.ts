import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCheckoutSettlementWaterfallConsistent } from '../../src/lib/checkout/settlementInvariants';
import {
  computeCheckoutSettlementV2,
  type CheckoutSettlementWaterfall,
} from '../../src/lib/checkout/checkoutSettlementEngineV2';
import { dailyRateFromMonthly } from '../../src/services/billing';

test('long-stay prepaid unused rent is not zeroed by check-in-to-vacate consumption', () => {
  const monthlyRentPaise = 459_000;
  const dailyRentPaise = dailyRateFromMonthly(monthlyRentPaise);
  const prepaidAfterVacatingPaise = dailyRentPaise * 6;
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-06-01',
    stayCheckoutDate: '2026-08-25',
    rentPaidPaise: 1_377_000,
    monthlyRentPaise,
    depositCollectedPaise: 450_000,
    missingNoticeDays: 0,
    noticeApplies: true,
    prepaidAfterVacatingPaise,
    checkoutTailRentPaise: 0,
  });
  assert.equal(waterfall.rentBucket.unusedPaise, prepaidAfterVacatingPaise);
  assert.equal(waterfall.refund.unusedRentPortionPaise, prepaidAfterVacatingPaise);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
});

test('electricity and notice remain separate buckets in waterfall', () => {
  const monthlyRentPaise = 459_000;
  const waterfall: CheckoutSettlementWaterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-06-01',
    stayCheckoutDate: '2026-08-24',
    rentPaidPaise: 459_000,
    monthlyRentPaise,
    depositCollectedPaise: 450_000,
    missingNoticeDays: 0,
    noticeApplies: true,
    prepaidAfterVacatingPaise: 50_000,
    electricityPaise: 12_000,
  });

  assert.equal(waterfall.depositBucket.electricityPaise, 12_000);
  assert.ok(waterfall.notice.fullPaise >= 0);
  assertCheckoutSettlementWaterfallConsistent(waterfall);
});

test('final refundable combines deposit portion and unused rent after notice', () => {
  const monthlyRentPaise = 459_000;
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-06-01',
    stayCheckoutDate: '2026-08-24',
    rentPaidPaise: 459_000,
    monthlyRentPaise,
    depositCollectedPaise: 450_000,
    missingNoticeDays: 0,
    noticeApplies: true,
    prepaidAfterVacatingPaise: 80_000,
  });

  const expectedTotal =
    waterfall.depositBucket.refundablePaise + waterfall.refund.unusedRentPortionPaise;
  assert.equal(waterfall.refund.totalPaise, expectedTotal);
});
