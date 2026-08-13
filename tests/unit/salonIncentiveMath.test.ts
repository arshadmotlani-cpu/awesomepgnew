import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  computeProductSalesIncentivePaise,
  computeSalonIncentivePaise,
  computeServicePerformanceIncentivePaise,
} from '@/src/workforce/lib/incentivePlanMath';
import { computeSalonIncentiveFromTotals } from '@/src/workforce/services/salonIncentive';
import { buildIncentivePlanFromSalary } from '@/src/workforce/lib/salonCompensationRules';
import { migrateLegacyThresholdConfig } from '@/src/workforce/lib/incentiveRuleEngine';
import type { PercentageThresholdIncentiveConfig } from '@/src/workforce/types/hr';

const salary20kConfig: PercentageThresholdIncentiveConfig = {
  baseSalaryPaise: 2_000_000,
  thresholdMultiplier: 2,
  belowThresholdPercentBps: 500,
  aboveThresholdPercentBps: 1000,
};

function rupeesToPaise(rupees: number): number {
  return rupees * 100;
}

function serviceInr(inr: number): number {
  return computeServicePerformanceIncentivePaise(salary20kConfig, rupeesToPaise(inr));
}

function productInr(inr: number): number {
  return computeProductSalesIncentivePaise(rupeesToPaise(inr));
}

describe('Salon incentive math — service threshold switch (₹12k salary)', () => {
  const salary12kConfig: PercentageThresholdIncentiveConfig = {
    baseSalaryPaise: 1_200_000,
    thresholdMultiplier: 2,
    belowThresholdPercentBps: 500,
    aboveThresholdPercentBps: 1000,
  };

  test('₹24k service performance → ₹2,400 (10% at threshold boundary)', () => {
    assert.equal(
      computeServicePerformanceIncentivePaise(salary12kConfig, rupeesToPaise(24_000)),
      240_000,
    );
  });

  test('₹25k service performance → ₹2,500 (10% on entire amount above threshold)', () => {
    assert.equal(
      computeServicePerformanceIncentivePaise(salary12kConfig, rupeesToPaise(25_000)),
      250_000,
    );
  });
});

describe('Salon incentive math — service threshold switch (₹20k salary)', () => {
  test('₹0 service performance → ₹0 incentive', () => {
    assert.equal(serviceInr(0), 0);
  });

  test('₹10k service performance → ₹500 (5%)', () => {
    assert.equal(serviceInr(10_000), 50_000);
  });

  test('₹40k service performance → ₹4k (10% at threshold boundary)', () => {
    assert.equal(serviceInr(40_000), 400_000);
  });

  test('₹40,010 service performance → ₹4,001 (10% on entire amount)', () => {
    assert.equal(serviceInr(40_010), 400_100);
  });

  test('₹1L service performance → ₹10k (10%)', () => {
    assert.equal(serviceInr(100_000), 1_000_000);
  });

  test('₹60k service performance → ₹6k (10% on entire amount)', () => {
    assert.equal(serviceInr(60_000), 600_000);
  });
});

describe('Salon incentive math — product sales', () => {
  test('product sales always 5%', () => {
    assert.equal(productInr(10_000), 50_000);
    assert.equal(productInr(0), 0);
  });

  test('product sales do not affect service threshold', () => {
    const performancePaise = rupeesToPaise(40_010);
    const serviceOnly = computeSalonIncentivePaise(salary20kConfig, performancePaise, 0);
    const withProducts = computeSalonIncentivePaise(salary20kConfig, performancePaise, rupeesToPaise(10_000));
    assert.equal(withProducts - serviceOnly, productInr(10_000));
    assert.equal(serviceOnly, 400_100);
  });
});

describe('Salon incentive math — disabled / no plan', () => {
  test('buildIncentivePlanFromSalary disabled returns none', () => {
    const plan = buildIncentivePlanFromSalary(2_000_000, false);
    assert.equal(plan.planType, 'none');
  });

  test('zero salary with enabled flag returns none', () => {
    const plan = buildIncentivePlanFromSalary(0, true);
    assert.equal(plan.planType, 'none');
  });
});

describe('computeSalonIncentiveFromTotals', () => {
  test('sums service and product components', () => {
    const config = migrateLegacyThresholdConfig(salary20kConfig);
    const result = computeSalonIncentiveFromTotals(
      config,
      1_000_000,
      200_000,
      'salon_rules',
    );
    assert.equal(result.serviceIncentivePaise, 50_000);
    assert.equal(result.productIncentivePaise, 10_000);
    assert.equal(result.totalIncentivePaise, 60_000);
  });
});
