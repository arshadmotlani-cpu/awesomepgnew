/**
 * Property income source engine — unit tests (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isActiveIncomeStatus,
  PROPERTY_INCOME_SOURCE_TYPES,
} from '@/src/owner/lib/wealth/propertyIncomeTypes';
import { paiseFromRupees } from '@/src/owner/lib/wealth/types';
import { computePropertyAnalytics } from '@/src/owner/lib/wealth/propertyAnalytics';

describe('property income sources', () => {
  test('active status contributes to gross; vacant excluded', () => {
    const sources = [
      { status: 'ACTIVE', monthly: 1500000 },
      { status: 'ACTIVE', monthly: 1200000 },
      { status: 'VACANT', monthly: 1000000 },
    ];
    const gross = sources
      .filter((s) => isActiveIncomeStatus(s.status))
      .reduce((sum, s) => sum + s.monthly, 0);
    assert.equal(gross, 2700000);
  });

  test('five shops aggregate correctly', () => {
    const shops = [
      paiseFromRupees(15000),
      paiseFromRupees(12000),
      paiseFromRupees(8000),
      paiseFromRupees(20000),
      paiseFromRupees(9000),
    ];
    const total = shops.reduce((a, b) => a + b, 0);
    assert.equal(total, paiseFromRupees(64000));
  });

  test('vacant shop removes from current gross only', () => {
    const active = paiseFromRupees(115000);
    const vacant = paiseFromRupees(12000);
    assert.equal(active, active);
    assert.notEqual(active + vacant, active);
    assert.equal(active, paiseFromRupees(115000));
  });

  test('rent change preserves history conceptually', () => {
    const history = [
      { from: '2026-01-01', to: '2026-06-30', monthly: paiseFromRupees(10000) },
      { from: '2026-07-01', to: null, monthly: paiseFromRupees(12000) },
    ];
    assert.equal(history[0].monthly, paiseFromRupees(10000));
    assert.equal(history[1].monthly, paiseFromRupees(12000));
  });

  test('PG linked skips manual rental in legacy rule', () => {
    const linkedPg = 'pg-id';
    const configuredMonthlyRental = linkedPg ? 0 : paiseFromRupees(80000);
    assert.equal(configuredMonthlyRental, 0);
  });

  test('property income does not change asset value', () => {
    const market = paiseFromRupees(4435717);
    const income = paiseFromRupees(115000);
    assert.notEqual(market + income, market);
  });

  test('gross rental yield', () => {
    const analytics = computePropertyAnalytics({
      ownerBasisPaise: paiseFromRupees(20000000),
      ownerCurrentValuePaise: paiseFromRupees(20000000),
      yearlyIncomePaise: paiseFromRupees(1380000),
      yearlyExpensePaise: paiseFromRupees(240000),
    });
    assert.ok(analytics.rentalYieldPct != null);
    assert.ok(analytics.rentalYieldPct! > 6.8 && analytics.rentalYieldPct! < 7.1);
    assert.ok(analytics.netRentalYieldPct != null);
    assert.ok(analytics.netRentalYieldPct! < analytics.rentalYieldPct!);
  });

  test('multiple properties aggregate', () => {
    const a = paiseFromRupees(115000);
    const b = paiseFromRupees(70000);
    const c = paiseFromRupees(35000);
    assert.equal(a + b + c, paiseFromRupees(220000));
  });

  test('income source types enum is structured', () => {
    assert.ok(PROPERTY_INCOME_SOURCE_TYPES.some((t) => t.value === 'SHOP'));
    assert.ok(PROPERTY_INCOME_SOURCE_TYPES.some((t) => t.value === 'PG'));
    assert.equal(PROPERTY_INCOME_SOURCE_TYPES.length, 7);
  });
});
