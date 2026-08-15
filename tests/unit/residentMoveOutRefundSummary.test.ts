import assert from 'node:assert/strict';
import test from 'node:test';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { buildResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';

function mockWaterfall(
  overrides: Partial<CheckoutSettlementWaterfall> = {},
): CheckoutSettlementWaterfall {
  return {
    depositBucket: {
      collectedPaise: 500000,
      electricityPaise: 20000,
      otherPaise: 5000,
      tailRentPaise: 0,
      ...overrides.depositBucket,
    },
    notice: {
      fromDepositPaise: 10000,
      ...overrides.notice,
    },
    refund: {
      unusedRentPortionPaise: 15000,
      totalPaise: 485000,
      ...overrides.refund,
    },
    ...overrides,
  } as CheckoutSettlementWaterfall;
}

test('buildResidentMoveOutRefundSummary maps waterfall to resident lines', () => {
  const summary = buildResidentMoveOutRefundSummary(mockWaterfall());

  assert.equal(summary.securityDepositPaise, 500000);
  assert.equal(summary.unusedPrepaidRentPaise, 15000);
  assert.equal(summary.electricityDeductionPaise, 20000);
  assert.equal(summary.otherDeductionsPaise, 15000);
  assert.equal(summary.estimatedRefundPaise, 485000);
});

test('buildResidentMoveOutRefundSummary omits zero unused prepaid in UI layer', () => {
  const summary = buildResidentMoveOutRefundSummary(
    mockWaterfall({ refund: { unusedRentPortionPaise: 0, totalPaise: 470000 } }),
  );
  assert.equal(summary.unusedPrepaidRentPaise, 0);
});
