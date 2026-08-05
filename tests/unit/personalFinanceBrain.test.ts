/**
 * Unit tests for Personal Finance Brain — composition + explainability (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatMetricDisplay, moneyValue, sumMoney } from '@/src/personalFinance/explain';
import { notConnectedMoney } from '@/src/personalFinance/adapters/unconnected';
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

  test('income rates derive from monthly only when connected', () => {
    const monthly = moneyValue({
      id: 'monthly_income',
      label: 'Monthly Income',
      paise: 300_000_00,
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: 'test',
      sourceApi: 'test',
      connected: true,
    });
    const rates = deriveIncomeRates(monthly);
    assert.equal(rates.quarterly.paise, 900_000_00);
    assert.equal(rates.yearly.paise, 3_600_000_00);
    assert.equal(rates.daily.paise, 10_000_00);
    assert.equal(rates.hourly.paise, Math.floor(300_000_00 / (30 * 8)));
    assert.ok(rates.daily.lineage[0]?.ref === 'monthly_income');
  });

  test('income rates are Not Connected when monthly income is disconnected', () => {
    const monthly = moneyValue({
      id: 'monthly_income',
      label: 'Monthly Income',
      paise: 0,
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: 'test',
      sourceApi: 'test',
      connected: false,
    });
    const rates = deriveIncomeRates(monthly);
    assert.equal(rates.quarterly.connected, false);
    assert.equal(formatMetricDisplay(rates.quarterly), 'Not Connected');
  });

  test('FI percent caps at 100 when dependencies connected', () => {
    const fi = financialIndependencePercent({
      passiveIncomePaise: 200_00,
      monthlyBurnPaise: 100_00,
      passiveConnected: true,
      burnConnected: true,
    });
    assert.equal(fi.kind, 'percent');
    assert.equal(fi.percent, 100);
    assert.equal(fi.connected, true);
  });

  test('FI percent is Not Connected without burn baseline', () => {
    const fi = financialIndependencePercent({
      passiveIncomePaise: 200_00,
      monthlyBurnPaise: 0,
      passiveConnected: true,
      burnConnected: false,
    });
    assert.equal(fi.connected, false);
    assert.equal(formatMetricDisplay(fi), 'Not Connected');
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

  test('Owner home dashboard UI exposes explain dialog', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/owner/components/OwnerHomeDashboard.tsx'),
      'utf8',
    );
    assert.match(src, /Owner OS/);
    assert.match(src, /ExplainableMetricCard/);
    assert.match(src, /Connect later/);
  });

  test('sumMoney skips unconnected metrics', () => {
    const connected = moneyValue({
      id: 'c',
      label: 'Connected',
      paise: 100_00,
      brain: 'personal_finance',
      engine: 'awesome_pg',
      calculation: 'test',
      sourceApi: 'test',
    });
    const unconnected = notConnectedMoney('u', 'Unconnected', 'Bank Engine');
    const sum = sumMoney('total', 'Total', [connected, unconnected], 'connected only');
    assert.equal(sum.paise, 100_00);
  });
});
