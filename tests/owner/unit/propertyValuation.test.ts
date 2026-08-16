/**
 * Property valuation engine — unit tests (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  computeAppreciationMetrics,
  projectionHorizons,
  projectPropertyValue,
  yearlyProjectionsFromValue,
} from '@/src/owner/lib/wealth/propertyValuation';

describe('property valuation engine', () => {
  test('computeAppreciationMetrics calculates owner share', () => {
    const result = computeAppreciationMetrics({
      basis: {
        purchasePricePaise: 100_000_00,
        purchaseCostsPaise: 5_000_00,
        ownershipPctBps: 5000,
      },
      currentValuePaise: 120_000_00,
      purchaseDate: '2024-01-01',
      asOfDate: '2026-01-01',
    });

    assert.equal(result.ownerBasisPaise, 52_500_00);
    assert.equal(result.ownerCurrentValuePaise, 60_000_00);
    assert.equal(result.appreciationPaise, 7_500_00);
    assert.ok(result.appreciationPct > 0);
  });

  test('projectPropertyValue compounds annually', () => {
    const projected = projectPropertyValue({
      basisPaise: 100_000_00,
      annualRateBps: 800,
      years: 1,
    });
    assert.equal(projected, 108_000_00);
  });

  test('projectionHorizons returns multiple horizons', () => {
    const horizons = projectionHorizons(100_000_00, 800);
    assert.ok(horizons.oneYear < horizons.tenYears);
    assert.ok(horizons.threeYears < horizons.fiveYears);
  });

  test('yearlyProjectionsFromValue year 0 is actual, later years projected', () => {
    const rows = yearlyProjectionsFromValue(100_000_00, 800, 2026, 4);
    assert.equal(rows[0]!.year, 2026);
    assert.equal(rows[0]!.isProjected, false);
    assert.equal(rows[0]!.valuePaise, 100_000_00);
    assert.equal(rows[1]!.isProjected, true);
    assert.ok(rows[1]!.valuePaise > rows[0]!.valuePaise);
  });
});
