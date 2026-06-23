import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCheckoutSettlementDeductionPlan,
  checkoutSettlementRequiresLedgerDeductions,
} from '@/src/services/checkoutSettlement';

test('Harish scenario builds notice and electricity deduction plan', () => {
  const plan = buildCheckoutSettlementDeductionPlan({
    noticeDeductionPaise: 59_500,
    noticeShortfallDays: 5,
    electricitySharePaise: 90_500,
    electricityDeductFromDeposit: true,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
  });
  assert.equal(plan.length, 2);
  assert.equal(plan[0]?.amountPaise, 59_500);
  assert.match(plan[0]?.reason ?? '', /Notice shortfall/);
  assert.equal(plan[1]?.amountPaise, 90_500);
  assert.match(plan[1]?.reason ?? '', /Electricity/);
  const total = plan.reduce((sum, row) => sum + row.amountPaise, 0);
  assert.equal(total, 150_000);
});

test('zero-refund checkout with deductions still requires ledger writes', () => {
  const row = {
    noticeDeductionPaise: 59_500,
    noticeShortfallDays: 5,
    electricitySharePaise: 90_500,
    electricityDeductFromDeposit: true,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
  };
  assert.equal(checkoutSettlementRequiresLedgerDeductions(row), true);
  const finalRefund = Math.max(0, 150_000 - 59_500 - 90_500);
  assert.equal(finalRefund, 0);
});

test('electricity skipped when not deducted from deposit', () => {
  const plan = buildCheckoutSettlementDeductionPlan({
    noticeDeductionPaise: 0,
    noticeShortfallDays: 0,
    electricitySharePaise: 90_500,
    electricityDeductFromDeposit: false,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
  });
  assert.equal(plan.length, 0);
});
