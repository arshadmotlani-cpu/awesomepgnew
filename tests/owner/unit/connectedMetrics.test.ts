/**
 * Owner OS connected metric model — unit tests (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatMetricDisplay, moneyValue, sumMoney } from '@/src/personalFinance/explain';
import {
  notConnectedMoney,
  notConnectedPercent,
} from '@/src/personalFinance/adapters/unconnected';

describe('Owner OS connected metrics', () => {
  test('formatMetricDisplay shows Not Connected instead of ₹0', () => {
    const bank = notConnectedMoney('bank_balance', 'Bank Balance', 'Bank Engine');
    assert.equal(formatMetricDisplay(bank), 'Not Connected');
    assert.equal(bank.connected, false);
  });

  test('sumMoney excludes unconnected parts from totals', () => {
    const connected = moneyValue({
      id: 'vehicle',
      label: 'Vehicle',
      paise: 500_000_00,
      brain: 'personal_finance',
      engine: 'automotive_capital',
      calculation: 'api',
      sourceApi: 'test',
    });
    const bank = notConnectedMoney('bank', 'Bank', 'Bank Engine');
    const assets = sumMoney('assets', 'Assets', [connected, bank], 'connected only');
    assert.equal(assets.paise, 500_000_00);
    assert.equal(assets.connected, true);
  });

  test('notConnectedPercent renders as Not Connected', () => {
    const trend = notConnectedPercent('net_worth_trend', 'Net Worth Trend', 'Forecast Brain');
    assert.equal(formatMetricDisplay(trend), 'Not Connected');
  });

  test('OwnerHomeDashboard has Connect later section', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/owner/components/OwnerHomeDashboard.tsx'),
      'utf8',
    );
    assert.match(src, /Connect later/);
    assert.match(src, /Not Connected/);
    assert.match(src, /BrainHealthPanel/);
    assert.match(src, /RecentEventsPanel/);
  });

  test('OwnerSummaryCard has no Personal Finance metrics on PG admin', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/components/admin/overview/owner/OwnerSummaryCard.tsx'),
      'utf8',
    );
    assert.match(src, /Open Owner OS/);
    assert.doesNotMatch(src, /formatMetricDisplay/);
    assert.doesNotMatch(src, /PersonalFinanceSnapshot/);
  });

  test('Forecast and Tax routes are not exposed in Owner sidebar', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/owner/components/OwnerSidebar.tsx'), 'utf8');
    assert.doesNotMatch(src, /\/forecast/);
    assert.doesNotMatch(src, /\/tax/);
  });
});
