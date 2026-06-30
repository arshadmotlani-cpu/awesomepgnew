import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure reconciliation math mirrored from createElectricityBill — checkout credits
 * reduce splittable total after prepaid, never below zero.
 */
function netSplittablePaise(input: {
  grossTotalPaise: number;
  prepaidCreditPaise: number;
  checkoutCollectedPaise: number;
}): {
  prepaidCreditAppliedPaise: number;
  checkoutCreditAppliedPaise: number;
  netSplittablePaise: number;
} {
  const prepaidCreditAppliedPaise = Math.min(input.prepaidCreditPaise, input.grossTotalPaise);
  const afterPrepaidPaise = input.grossTotalPaise - prepaidCreditAppliedPaise;
  const checkoutCreditAppliedPaise = Math.min(input.checkoutCollectedPaise, afterPrepaidPaise);
  const netSplittablePaise = afterPrepaidPaise - checkoutCreditAppliedPaise;
  return { prepaidCreditAppliedPaise, checkoutCreditAppliedPaise, netSplittablePaise };
}

test('checkout electricity reconciliation subtracts collected amounts before monthly split', () => {
  const result = netSplittablePaise({
    grossTotalPaise: 200_000,
    prepaidCreditPaise: 0,
    checkoutCollectedPaise: 55_000,
  });
  assert.equal(result.checkoutCreditAppliedPaise, 55_000);
  assert.equal(result.netSplittablePaise, 145_000);
});

test('checkout credit cannot exceed remaining bill after prepaid', () => {
  const result = netSplittablePaise({
    grossTotalPaise: 200_000,
    prepaidCreditPaise: 50_000,
    checkoutCollectedPaise: 180_000,
  });
  assert.equal(result.prepaidCreditAppliedPaise, 50_000);
  assert.equal(result.checkoutCreditAppliedPaise, 150_000);
  assert.equal(result.netSplittablePaise, 0);
});

test('no checkout credit leaves full bill splittable', () => {
  const result = netSplittablePaise({
    grossTotalPaise: 200_000,
    prepaidCreditPaise: 0,
    checkoutCollectedPaise: 0,
  });
  assert.equal(result.checkoutCreditAppliedPaise, 0);
  assert.equal(result.netSplittablePaise, 200_000);
});
