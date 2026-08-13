import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  computeIncentiveFromRules,
  getApplicableIncentiveRateBps,
  migrateLegacyThresholdConfig,
  validateAndNormalizeRules,
} from '@/src/workforce/lib/incentiveRuleEngine';
import { computeSalonIncentiveFromTotals } from '@/src/workforce/services/salonIncentive';
import { computeServicePerformanceIncentivePaise } from '@/src/workforce/lib/incentivePlanMath';
import type { PercentageThresholdIncentiveConfig, SalonRulesIncentiveConfig } from '@/src/workforce/types/hr';

function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

function inrFromPaise(paise: number): number {
  return paise / 100;
}

describe('Incentive rule engine — flat rules', () => {
  test('flat 5% on all performance', () => {
    const rules = [{ thresholdPaise: 0, percentBps: 500 }];
    assert.equal(getApplicableIncentiveRateBps(rupeesToPaise(30_000), rules), 500);
    assert.equal(computeIncentiveFromRules(rupeesToPaise(30_000), rules), rupeesToPaise(1_500));
  });

  test('flat 10% on all performance', () => {
    const rules = [{ thresholdPaise: 0, percentBps: 1000 }];
    assert.equal(computeIncentiveFromRules(rupeesToPaise(10_000), rules), rupeesToPaise(1_000));
  });

  test('0% flat rule yields zero incentive', () => {
    const rules = [{ thresholdPaise: 0, percentBps: 0 }];
    assert.equal(computeIncentiveFromRules(rupeesToPaise(50_000), rules), 0);
  });
});

describe('Incentive rule engine — service threshold switch', () => {
  const twoLevel: { thresholdPaise: number; percentBps: number }[] = [
    { thresholdPaise: 0, percentBps: 500 },
    { thresholdPaise: rupeesToPaise(24_000), percentBps: 1000 },
  ];

  test('below threshold → lower rate on entire amount', () => {
    assert.equal(computeIncentiveFromRules(rupeesToPaise(23_999), twoLevel), 119_995);
  });

  test('exactly at threshold → higher rate on entire amount', () => {
    assert.equal(computeIncentiveFromRules(rupeesToPaise(24_000), twoLevel), rupeesToPaise(2_400));
  });

  test('just above threshold → higher rate on entire amount', () => {
    assert.equal(computeIncentiveFromRules(rupeesToPaise(25_000), twoLevel), rupeesToPaise(2_500));
  });

  test('high performance → higher rate on entire amount (not tiered)', () => {
    assert.equal(computeIncentiveFromRules(rupeesToPaise(100_000), twoLevel), rupeesToPaise(10_000));
  });

  const threeLevel = [
    { thresholdPaise: 0, percentBps: 300 },
    { thresholdPaise: rupeesToPaise(20_000), percentBps: 500 },
    { thresholdPaise: rupeesToPaise(40_000), percentBps: 1000 },
  ];

  test('three-level: ₹15k → 3%', () => {
    assert.equal(computeIncentiveFromRules(rupeesToPaise(15_000), threeLevel), rupeesToPaise(450));
  });

  test('three-level: ₹25k → 5%', () => {
    assert.equal(computeIncentiveFromRules(rupeesToPaise(25_000), threeLevel), rupeesToPaise(1_250));
  });

  test('three-level: ₹45k → 10%', () => {
    assert.equal(computeIncentiveFromRules(rupeesToPaise(45_000), threeLevel), rupeesToPaise(4_500));
  });
});

describe('Incentive rule engine — product rules independent', () => {
  const serviceRules = [
    { thresholdPaise: 0, percentBps: 500 },
    { thresholdPaise: rupeesToPaise(24_000), percentBps: 1000 },
  ];
  const productRules = [
    { thresholdPaise: 0, percentBps: 500 },
    { thresholdPaise: rupeesToPaise(20_000), percentBps: 800 },
  ];

  test('service rules do not affect product calculation', () => {
    const config: SalonRulesIncentiveConfig = {
      serviceEnabled: true,
      productEnabled: true,
      serviceRules,
      productRules,
    };
    const result = computeSalonIncentiveFromTotals(
      config,
      rupeesToPaise(50_000),
      rupeesToPaise(25_000),
      'salon_rules',
    );
    assert.equal(result.serviceIncentivePaise, rupeesToPaise(5_000));
    assert.equal(result.productIncentivePaise, rupeesToPaise(2_000));
  });

  test('product three-level threshold', () => {
    const rules = [
      { thresholdPaise: 0, percentBps: 500 },
      { thresholdPaise: rupeesToPaise(20_000), percentBps: 800 },
      { thresholdPaise: rupeesToPaise(40_000), percentBps: 1000 },
    ];
    assert.equal(computeIncentiveFromRules(rupeesToPaise(15_000), rules), rupeesToPaise(750));
    assert.equal(computeIncentiveFromRules(rupeesToPaise(25_000), rules), rupeesToPaise(2_000));
    assert.equal(computeIncentiveFromRules(rupeesToPaise(45_000), rules), rupeesToPaise(4_500));
  });
});

describe('Incentive rule engine — validation', () => {
  test('auto-sorts rules by threshold', () => {
    const sorted = validateAndNormalizeRules([
      { thresholdPaise: rupeesToPaise(24_000), percentBps: 1000 },
      { thresholdPaise: 0, percentBps: 500 },
    ]);
    assert.equal(sorted[0]!.thresholdPaise, 0);
    assert.equal(sorted[1]!.thresholdPaise, rupeesToPaise(24_000));
  });

  test('rejects duplicate thresholds', () => {
    assert.throws(() =>
      validateAndNormalizeRules([
        { thresholdPaise: 0, percentBps: 500 },
        { thresholdPaise: 0, percentBps: 1000 },
      ]),
    );
  });

  test('rejects missing base rule at zero', () => {
    assert.throws(() =>
      validateAndNormalizeRules([{ thresholdPaise: rupeesToPaise(20_000), percentBps: 500 }]),
    );
  });
});

describe('Legacy percentage_threshold backward compatibility', () => {
  const salary12kConfig: PercentageThresholdIncentiveConfig = {
    baseSalaryPaise: rupeesToPaise(12_000),
    thresholdMultiplier: 2,
    belowThresholdPercentBps: 500,
    aboveThresholdPercentBps: 1000,
  };

  test('migrates legacy 2× salary plan to configurable rules', () => {
    const migrated = migrateLegacyThresholdConfig(salary12kConfig);
    assert.equal(migrated.serviceRules.length, 2);
    assert.equal(migrated.serviceRules[1]!.thresholdPaise, rupeesToPaise(24_000));
  });

  test('legacy config: ₹25k service → 10% on entire amount', () => {
    assert.equal(
      computeServicePerformanceIncentivePaise(salary12kConfig, rupeesToPaise(25_000)),
      rupeesToPaise(2_500),
    );
  });

  test('legacy config: below threshold uses lower rate', () => {
    assert.equal(
      computeServicePerformanceIncentivePaise(salary12kConfig, rupeesToPaise(20_000)),
      rupeesToPaise(1_000),
    );
  });
});
