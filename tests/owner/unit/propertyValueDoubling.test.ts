/**
 * Property value doubling regression — unit tests (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  acquisitionBasisPaise,
  computeAppreciationMetrics,
  resolveCurrentMarketValuePaise,
  ownerShareBasisPaise,
  ownerShareMarketValuePaise,
  yearlyProjectionsFromValue,
} from '@/src/owner/lib/wealth/propertyValuation';
import { paiseFromRupees } from '@/src/owner/lib/wealth/types';

describe('property value — no doubling', () => {
  const purchasePaise = paiseFromRupees(3310000);
  const basis = {
    purchasePricePaise: purchasePaise,
    purchaseCostsPaise: 0,
    ownershipPctBps: 10000,
  };

  test('resolveCurrentMarketValuePaise defaults to purchase only, not purchase+costs', () => {
    const market = resolveCurrentMarketValuePaise(null, purchasePaise);
    assert.equal(market, purchasePaise);
    assert.notEqual(market, purchasePaise * 2);
  });

  test('3310000 purchase at 100% ownership shows same owner value', () => {
    const market = resolveCurrentMarketValuePaise(purchasePaise, purchasePaise);
    const ownerValue = ownerShareMarketValuePaise(market, 10000);
    assert.equal(ownerValue, purchasePaise);
    assert.notEqual(ownerValue, purchasePaise * 2);
  });

  test('acquisition basis with costs does not change market value default', () => {
    const costsPaise = paiseFromRupees(275000);
    const withCosts = {
      purchasePricePaise: purchasePaise,
      purchaseCostsPaise: costsPaise,
      ownershipPctBps: 10000,
    };
    assert.equal(acquisitionBasisPaise(withCosts), purchasePaise + costsPaise);
    const market = resolveCurrentMarketValuePaise(null, purchasePaise);
    assert.equal(market, purchasePaise);
  });

  test('50% ownership halves owner share only once', () => {
    const halfBasis = { ...basis, ownershipPctBps: 5000 };
    const ownerShare = ownerShareMarketValuePaise(purchasePaise, 5000);
    assert.equal(ownerShare, Math.round(purchasePaise / 2));
  });

  test('appreciation is zero when purchase equals current', () => {
    const metrics = computeAppreciationMetrics({
      basis,
      currentValuePaise: purchasePaise,
      purchaseDate: '2024-01-01',
      asOfDate: '2026-01-01',
    });
    assert.equal(metrics.ownerCurrentValuePaise, purchasePaise);
    assert.equal(metrics.appreciationPaise, 0);
    assert.equal(metrics.appreciationPct, 0);
  });

  test('projections start from actual current value not doubled basis', () => {
    const ownerCurrent = ownerShareMarketValuePaise(purchasePaise, 10000);
    const projections = yearlyProjectionsFromValue(ownerCurrent, 500, 2026, 3);
    assert.equal(projections[0].valuePaise, ownerCurrent);
    assert.equal(projections[0].valuePaise, purchasePaise);
    assert.notEqual(projections[0].valuePaise, purchasePaise * 2);
  });

  test('projected year 1 at 5% from 3310000', () => {
    const ownerCurrent = purchasePaise;
    const projections = yearlyProjectionsFromValue(ownerCurrent, 500, 2026, 2);
    const year1 = projections[1].valuePaise;
    const expected = Math.round(ownerCurrent * 1.05);
    assert.equal(year1, expected);
  });
});

describe('property income does not affect asset value', () => {
  test('income paise is separate from market value paise', () => {
    const purchasePaise = paiseFromRupees(3310000);
    const monthlyIncomePaise = paiseFromRupees(200000);
    const market = resolveCurrentMarketValuePaise(purchasePaise, purchasePaise);
    assert.equal(market, purchasePaise);
    assert.notEqual(market + monthlyIncomePaise, market);
    assert.notEqual(market, purchasePaise + monthlyIncomePaise);
  });
});
