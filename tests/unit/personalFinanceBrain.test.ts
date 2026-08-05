/**
 * Unit tests for Personal Finance Brain — composition + explainability (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { moneyValue, sumMoney } from '@/src/personalFinance/explain';
import {
  deriveIncomeRates,
  financialIndependencePercent,
} from '@/src/personalFinance/lib/rates';
import { isPersonalFinanceOsEnabled } from '@/src/personalFinance/types';

describe('Personal Finance explainables', () => {
  test('sumMoney aggregates lineage without inventing engine math', () => {
    const a = moneyValue({
      id: 'a',
      label: 'A',
      paise: 100_00,
      brain: 'finance',
      engine: 'awesome_pg',
      calculation: 'api',
      sourceApi: 'test',
    });
    const b = moneyValue({
      id: 'b',
      label: 'B',
      paise: 50_00,
      brain: 'finance',
      engine: 'fyh_salon',
      calculation: 'api',
      sourceApi: 'test',
    });
    const sum = sumMoney('s', 'Sum', [a, b], 'a+b');
    assert.equal(sum.paise, 150_00);
    assert.equal(sum.brain, 'personal_finance');
    assert.equal(sum.lineage.length, 2);
    assert.ok(sum.calculation.includes('a+b'));
  });

  test('income rates derive from monthly only', () => {
    const monthly = moneyValue({
      id: 'monthly_income',
      label: 'Monthly Income',
      paise: 300_000_00,
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: 'test',
      sourceApi: 'test',
    });
    const rates = deriveIncomeRates(monthly);
    assert.equal(rates.quarterly.paise, 900_000_00);
    assert.equal(rates.yearly.paise, 3_600_000_00);
    assert.equal(rates.daily.paise, 10_000_00);
    assert.equal(rates.hourly.paise, Math.floor(300_000_00 / (30 * 8)));
    assert.ok(rates.daily.lineage[0]?.ref === 'monthly_income');
  });

  test('FI percent caps at 100', () => {
    const fi = financialIndependencePercent({
      passiveIncomePaise: 200_00,
      monthlyBurnPaise: 100_00,
    });
    assert.equal(fi.kind, 'percent');
    assert.equal(fi.percent, 100);
  });

  test('feature flag defaults on', () => {
    const prev = process.env.PERSONAL_FINANCE_OS;
    delete process.env.PERSONAL_FINANCE_OS;
    assert.equal(isPersonalFinanceOsEnabled(), true);
    process.env.PERSONAL_FINANCE_OS = '0';
    assert.equal(isPersonalFinanceOsEnabled(), false);
    if (prev === undefined) delete process.env.PERSONAL_FINANCE_OS;
    else process.env.PERSONAL_FINANCE_OS = prev;
  });
});
