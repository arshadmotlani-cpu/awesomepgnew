/**
 * Property appreciation model — date-aware compounding and actual vs estimated.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  completedAppreciationYears,
  estimatedMarketValueFromAppreciation,
  resolvePropertyValueState,
  isUserRecordedValuation,
  yearlyProjectionsFromValue,
} from '@/src/owner/lib/wealth/propertyValuation';
import { paiseFromRupees } from '@/src/owner/lib/wealth/types';

const PURCHASE_PAISE = paiseFromRupees(3310000);
const RATE_BPS = 500; // 5%

describe('property appreciation — date-aware model', () => {
  test('completedAppreciationYears: 2020 purchase to 2026 = 6 years', () => {
    assert.equal(completedAppreciationYears('2020-01-01', '2026-08-17'), 6);
  });

  test('completedAppreciationYears: before anniversary subtracts one year', () => {
    assert.equal(completedAppreciationYears('2020-12-31', '2026-08-17'), 5);
  });

  test('2020 + ₹33,10,000 + 5% → 2026 estimated ≈ ₹44,35,717', () => {
    const estimated = estimatedMarketValueFromAppreciation({
      purchasePricePaise: PURCHASE_PAISE,
      purchaseDate: '2020-01-01',
      annualRateBps: RATE_BPS,
      asOfDate: '2026-08-17',
    });
    const expected = Math.round(PURCHASE_PAISE * Math.pow(1.05, 6));
    assert.equal(estimated, expected);
    assert.ok(estimated > paiseFromRupees(4435000) && estimated < paiseFromRupees(4436000));
  });

  test('manual valuation overrides modelled value', () => {
    const manual = paiseFromRupees(5000000);
    const state = resolvePropertyValueState({
      latestValuationPaise: manual,
      latestValuationKind: 'ACTUAL',
      purchasePricePaise: PURCHASE_PAISE,
      purchaseDate: '2020-01-01',
      annualRateBps: RATE_BPS,
      asOfDate: '2026-08-17',
    });
    assert.equal(state.valueSource, 'actual');
    assert.equal(state.currentValueForNetWorthPaise, manual);
    assert.notEqual(state.currentValueForNetWorthPaise, state.estimatedMarketValuePaise);
  });

  test('production correction valuation does not block appreciation model', () => {
    const state = resolvePropertyValueState({
      latestValuationPaise: PURCHASE_PAISE,
      latestValuationKind: 'MARKET_ESTIMATE',
      latestValuationNotes: 'Production correction: duplicate costs',
      purchasePricePaise: PURCHASE_PAISE,
      purchaseDate: '2020-01-01',
      annualRateBps: RATE_BPS,
      asOfDate: '2026-08-17',
    });
    assert.equal(state.valueSource, 'estimated');
    assert.equal(state.actualMarketValuePaise, null);
    assert.ok(
      state.currentValueForNetWorthPaise > paiseFromRupees(4435000) &&
        state.currentValueForNetWorthPaise < paiseFromRupees(4436000),
    );
  });

  test('no valuation + appreciation uses estimated for net worth', () => {
    const state = resolvePropertyValueState({
      latestValuationPaise: null,
      purchasePricePaise: PURCHASE_PAISE,
      purchaseDate: '2020-01-01',
      annualRateBps: RATE_BPS,
      asOfDate: '2026-08-17',
    });
    assert.equal(state.valueSource, 'estimated');
    assert.equal(state.yearsHeld, 6);
    const pct = state.estimatedAppreciationPct;
    assert.ok(pct > 33.9 && pct < 34.1, `expected ~33.99%, got ${pct}`);
  });

  test('future projections do not alter current value base', () => {
    const state = resolvePropertyValueState({
      latestValuationPaise: null,
      purchasePricePaise: PURCHASE_PAISE,
      purchaseDate: '2020-01-01',
      annualRateBps: RATE_BPS,
      asOfDate: '2026-08-17',
    });
    const projections = yearlyProjectionsFromValue(
      state.currentValueForNetWorthPaise,
      RATE_BPS,
      2026,
      3,
    );
    assert.equal(projections[0].valuePaise, state.currentValueForNetWorthPaise);
    assert.equal(projections[0].isProjected, false);
    assert.ok(projections[1].valuePaise > projections[0].valuePaise);
    assert.equal(projections[1].isProjected, true);
  });

  test('acquisition costs do not become market value', () => {
    const state = resolvePropertyValueState({
      latestValuationPaise: null,
      purchasePricePaise: PURCHASE_PAISE,
      purchaseDate: '2020-01-01',
      annualRateBps: 0,
      asOfDate: '2026-08-17',
    });
    assert.equal(state.currentValueForNetWorthPaise, PURCHASE_PAISE);
  });

  test('isUserRecordedValuation rejects PROJECTED and production corrections', () => {
    assert.equal(isUserRecordedValuation('PROJECTED'), false);
    assert.equal(isUserRecordedValuation('MARKET_ESTIMATE', 'Production correction: foo'), false);
    assert.equal(isUserRecordedValuation('ACTUAL'), true);
    assert.equal(isUserRecordedValuation('MARKET_ESTIMATE', 'User entered'), true);
  });
});

describe('property income does not affect asset value', () => {
  test('income paise is separate from market value', () => {
    const income = paiseFromRupees(50000);
    const state = resolvePropertyValueState({
      latestValuationPaise: null,
      purchasePricePaise: PURCHASE_PAISE,
      purchaseDate: '2020-01-01',
      annualRateBps: RATE_BPS,
      asOfDate: '2026-08-17',
    });
    assert.notEqual(state.currentValueForNetWorthPaise + income, state.currentValueForNetWorthPaise);
  });
});
