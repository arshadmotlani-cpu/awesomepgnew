import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCheckoutSettlementV2 } from '../../src/lib/checkout/checkoutSettlementEngineV2';
import { computeWaterfallWithApprovalBaseline } from '../../src/lib/checkout/checkoutSettlementV2Compute';
import type { CheckoutSettlement } from '../../src/db/schema';

function baselineSettlement(): {
  baseline: ReturnType<typeof computeCheckoutSettlementV2>;
  settlement: CheckoutSettlement;
} {
  const baseline = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-04',
    stayCheckoutDate: '2026-07-21',
    rentPaidPaise: 412_080,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 14,
    noticeApplies: true,
    electricityPaise: 0,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
  });

  const settlement = {
    id: 'cs-1',
    monthlyRentPaiseSnapshot: 150_000,
    electricityDeductFromDeposit: true,
    electricitySharePaise: 0,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
    settlementWaterfallJson: baseline,
    approvalBaselineLocked: true,
    amountsLocked: false,
  } as CheckoutSettlement;

  return { baseline, settlement };
}

test('approval baseline keeps rent and notice buckets when live rent would differ', () => {
  const { baseline, settlement } = baselineSettlement();

  const recomputed = computeWaterfallWithApprovalBaseline({
    baseline,
    settlement,
    depositHeldPaise: 412_100,
    stayType: 'monthly',
    durationMode: 'monthly',
  });

  assert.equal(recomputed.rentBucket.paidPaise, baseline.rentBucket.paidPaise);
  assert.equal(recomputed.notice.missingNoticeDays, baseline.notice.missingNoticeDays);
  assert.equal(recomputed.notice.fromUnusedRentPaise, baseline.notice.fromUnusedRentPaise);
  assert.equal(recomputed.notice.fromDepositPaise, baseline.notice.fromDepositPaise);

  const liveRentWouldChange = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-04',
    stayCheckoutDate: '2026-07-21',
    rentPaidPaise: 500_000,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 14,
    noticeApplies: true,
    electricityPaise: 0,
  });

  assert.notEqual(liveRentWouldChange.rentBucket.paidPaise, baseline.rentBucket.paidPaise);
  assert.notEqual(liveRentWouldChange.refund.totalPaise, baseline.refund.totalPaise);
  assert.equal(recomputed.refund.totalPaise, baseline.refund.totalPaise);
});

test('approval baseline updates final refund when electricity is entered', () => {
  const { baseline, settlement } = baselineSettlement();

  const withElectricity = computeWaterfallWithApprovalBaseline({
    baseline,
    settlement: { ...settlement, electricitySharePaise: 52_000 },
    depositHeldPaise: 412_100,
  });

  assert.equal(withElectricity.rentBucket.paidPaise, baseline.rentBucket.paidPaise);
  assert.equal(withElectricity.notice.fromDepositPaise, baseline.notice.fromDepositPaise);
  assert.equal(withElectricity.depositBucket.electricityPaise, 52_000);
  assert.equal(
    withElectricity.refund.totalPaise,
    baseline.refund.totalPaise - 52_000,
  );
});
