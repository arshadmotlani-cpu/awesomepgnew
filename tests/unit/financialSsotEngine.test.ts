import assert from 'node:assert/strict';
import test from 'node:test';
import {
  billingCycleDueDate,
  billingCycleMonthForRunDate,
  expectedBillingMonths,
  isEndOfMonthBillingDay,
  shouldGenerateBillOnDate,
} from '../../src/lib/billing/billingCycleEngine';
import {
  formatDeductionReason,
  parseDeductionCategory,
  revenueBucketForCategory,
} from '../../src/lib/financial/deductionCategories';
import {
  computeOperatingRevenue,
  splitRentAndLateFees,
} from '../../src/services/financialMetricsEngine';

test('billing cycle clamps day 31 to February end in leap year', () => {
  assert.equal(billingCycleDueDate('2024-02-01', 31), '2024-02-29');
  assert.equal(isEndOfMonthBillingDay(31, '2024-02-01'), true);
});

test('billing cycle keeps day 31 in March', () => {
  assert.equal(billingCycleDueDate('2024-03-01', 31), '2024-03-31');
});

test('shouldGenerateBillOnDate respects first auto billing date', () => {
  assert.equal(
    shouldGenerateBillOnDate({
      runDate: '2024-07-05',
      billingDay: 5,
      firstAutoBillingDate: '2024-08-05',
    }),
    false,
  );
  assert.equal(
    shouldGenerateBillOnDate({
      runDate: '2024-08-05',
      billingDay: 5,
      firstAutoBillingDate: '2024-08-05',
    }),
    true,
  );
});

test('expectedBillingMonths lists consecutive months without skips', () => {
  const months = expectedBillingMonths({
    firstAutoBillingDate: '2024-03-15',
    throughDate: '2024-05-15',
    billingDay: 15,
  });
  assert.deepEqual(months, ['2024-03-01', '2024-04-01', '2024-05-01']);
});

test('billingCycleMonthForRunDate matches anniversary month', () => {
  assert.equal(billingCycleMonthForRunDate('2024-06-15'), '2024-06-01');
});

test('splitRentAndLateFees avoids double-counting late fees', () => {
  const split = splitRentAndLateFees({ incomeRentPaise: 110_000, lateFeePaise: 10_000 });
  assert.equal(split.rentPrincipalPaise, 100_000);
  assert.equal(split.lateFeePaise, 10_000);
});

test('operating revenue excludes deposits', () => {
  const operating = computeOperatingRevenue({
    rentPrincipalPaise: 100_000,
    lateFeePaise: 5_000,
    electricityPaise: 20_000,
    otherIncomePaise: 3_000,
  });
  assert.equal(operating.operatingRevenuePaise, 128_000);
});

test('deduction categories route to revenue buckets', () => {
  assert.equal(revenueBucketForCategory('electricity'), 'electricity');
  assert.equal(revenueBucketForCategory('damage'), 'other_income');
});

test('parseDeductionCategory reads bracket prefix', () => {
  const reason = formatDeductionReason('cleaning', 'Room not cleaned');
  assert.equal(parseDeductionCategory({ reason }), 'cleaning');
});
