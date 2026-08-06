import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildIncentivePlanFromSalary,
  salonIncentiveRuleSummary,
  SALON_INCENTIVE_RULES,
  SALON_PAYROLL_RULES,
} from '@/src/workforce/lib/salonCompensationRules';
import { computePercentageThresholdIncentivePaise } from '@/src/workforce/lib/incentivePlanMath';
import {
  isEmployeeEligibleForPeriod,
  isPayrollGenerationWindowOpen,
  resolvePreviousMonthPeriod,
} from '@/src/workforce/lib/payrollPeriod';

describe('Salon compensation rules', () => {
  test('fixed payroll window is 7th–10th', () => {
    assert.equal(SALON_PAYROLL_RULES.generationStartDay, 7);
    assert.equal(SALON_PAYROLL_RULES.generationEndDay, 10);
  });

  test('incentive plan uses global constants', () => {
    const plan = buildIncentivePlanFromSalary(2_000_000, true);
    assert.equal(plan.planType, 'percentage_threshold');
    assert.deepEqual(plan.config, {
      baseSalaryPaise: 2_000_000,
      thresholdMultiplier: SALON_INCENTIVE_RULES.thresholdMultiplier,
      aboveThresholdPercentBps: SALON_INCENTIVE_RULES.aboveThresholdPercentBps,
    });
  });

  test('example: ₹20k salary, ₹60k business → ₹2k incentive', () => {
    const plan = buildIncentivePlanFromSalary(2_000_000, true);
    assert.equal(plan.planType, 'percentage_threshold');
    if (plan.planType !== 'percentage_threshold') return;
    const incentive = computePercentageThresholdIncentivePaise(plan.config, 6_000_000);
    assert.equal(incentive, 200_000);
  });

  test('disabled incentive returns none plan', () => {
    const plan = buildIncentivePlanFromSalary(2_000_000, false);
    assert.equal(plan.planType, 'none');
  });

  test('rule summary mentions threshold and percent', () => {
    assert.match(salonIncentiveRuleSummary(), /10%/);
    assert.match(salonIncentiveRuleSummary(), /2×/);
  });
});

describe('Payroll period helpers', () => {
  test('previous month period for March reference', () => {
    const period = resolvePreviousMonthPeriod('Asia/Kolkata', new Date('2026-03-15T12:00:00+05:30'));
    assert.equal(period.periodStart, '2026-02-01');
    assert.equal(period.periodEnd, '2026-02-28');
  });

  test('generation window open on 8th, closed on 6th', () => {
    assert.equal(
      isPayrollGenerationWindowOpen(new Date('2026-03-08T12:00:00+05:30'), 'Asia/Kolkata'),
      true,
    );
    assert.equal(
      isPayrollGenerationWindowOpen(new Date('2026-03-06T12:00:00+05:30'), 'Asia/Kolkata'),
      false,
    );
  });

  test('joining date eligibility', () => {
    const period = { periodStart: '2026-01-01', periodEnd: '2026-01-31' };
    assert.equal(isEmployeeEligibleForPeriod('2026-01-15', period), true);
    assert.equal(isEmployeeEligibleForPeriod('2026-02-01', period), false);
    assert.equal(isEmployeeEligibleForPeriod(null, period), true);
  });
});
