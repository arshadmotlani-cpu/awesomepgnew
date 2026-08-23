import assert from 'node:assert/strict';
import test from 'node:test';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { buildResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';

function mockWaterfall(
  overrides: Partial<CheckoutSettlementWaterfall> = {},
): CheckoutSettlementWaterfall {
  return {
    engineVersion: 2,
    stay: {
      checkInDate: '2026-08-01',
      checkoutDate: '2026-08-24',
      stayDays: 24,
    },
    rentBucket: {
      paidPaise: 463_590,
      consumedPaise: 358_896,
      unusedPaise: 104_678,
      dailyRentPaise: 14_954,
    },
    notice: {
      missingNoticeDays: 1,
      fullPaise: 14_954,
      fromUnusedRentPaise: 14_954,
      fromDepositPaise: 0,
      unusedRentRemainingPaise: 89_724,
    },
    depositBucket: {
      collectedPaise: 450_000,
      electricityPaise: 0,
      otherPaise: 0,
      tailRentPaise: 0,
      refundablePaise: 450_000,
    },
    refund: {
      depositPortionPaise: 450_000,
      unusedRentPortionPaise: 89_724,
      totalPaise: 539_724,
    },
    lines: [],
    ...overrides,
  } as CheckoutSettlementWaterfall;
}

test('buildResidentMoveOutRefundSummary maps waterfall to resident lines', () => {
  const summary = buildResidentMoveOutRefundSummary(mockWaterfall());

  assert.equal(summary.securityDepositPaise, 450_000);
  assert.equal(summary.unusedPrepaidRentPaise, 104_678);
  assert.equal(summary.noticeDeductionPaise, 14_954);
  assert.equal(summary.netUnusedRentWalletCreditPaise, 89_724);
  assert.equal(summary.electricityDeductionPaise, 0);
  assert.equal(summary.otherDeductionsPaise, 0);
  assert.equal(summary.estimatedRefundPaise, 539_724);
});

test('buildResidentMoveOutRefundSummary does not treat tail rent as other deduction', () => {
  const summary = buildResidentMoveOutRefundSummary(
    mockWaterfall({
      depositBucket: {
        collectedPaise: 450_000,
        electricityPaise: 0,
        otherPaise: 0,
        tailRentPaise: 351_900,
        refundablePaise: 98_100,
      },
      notice: {
        missingNoticeDays: 1,
        fullPaise: 14_954,
        fromUnusedRentPaise: 14_954,
        fromDepositPaise: 0,
        unusedRentRemainingPaise: 89_724,
      },
    }),
  );
  assert.equal(summary.otherDeductionsPaise, 0);
  assert.equal(summary.securityDepositPaise, 450_000);
});

test('buildResidentMoveOutRefundSummary flags electricity pending for estimates', () => {
  const summary = buildResidentMoveOutRefundSummary(mockWaterfall(), { isEstimate: true });
  assert.equal(summary.electricityPending, true);

  const finalSummary = buildResidentMoveOutRefundSummary(mockWaterfall(), { isEstimate: false });
  assert.equal(finalSummary.electricityPending, false);
});
