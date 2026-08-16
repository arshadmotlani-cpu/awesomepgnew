/**
 * Property analytics — unit tests (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computePropertyAnalytics } from '@/src/owner/lib/wealth/propertyAnalytics';

describe('property analytics', () => {
  test('computes rental yield and net rental yield', () => {
    const result = computePropertyAnalytics({
      ownerBasisPaise: 100_000_00,
      ownerCurrentValuePaise: 150_000_00,
      yearlyIncomePaise: 12_000_00,
      yearlyExpensePaise: 2_000_00,
      purchaseDate: '2024-01-01',
      asOfDate: '2026-01-01',
    });

    assert.equal(result.capitalAppreciationPaise, 50_000_00);
    assert.equal(result.capitalAppreciationPct, 50);
    assert.equal(result.netYearlyIncomePaise, 10_000_00);
    assert.ok(result.rentalYieldPct != null && result.rentalYieldPct > 7);
    assert.ok(
      result.netRentalYieldPct != null && result.netRentalYieldPct < result.rentalYieldPct!,
    );
  });

  test('handles zero basis without throwing', () => {
    const result = computePropertyAnalytics({
      ownerBasisPaise: 0,
      ownerCurrentValuePaise: 100_00_00,
      yearlyIncomePaise: 0,
      yearlyExpensePaise: 0,
    });
    assert.equal(result.capitalAppreciationPct, 0);
    assert.equal(result.rentalYieldPct, 0);
  });
});
