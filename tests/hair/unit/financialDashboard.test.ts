import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMonthlyTrend,
  collectionsFromPaymentSplit,
  collectionsVsSalesFromParts,
  lastNDayKeys,
  sumCollections,
} from '@/src/hair/services/financialDashboard';

describe('financialDashboard helpers', () => {
  it('collectionsFromPaymentSplit buckets cash, upi, and card', () => {
    const out = collectionsFromPaymentSplit([
      { method: 'CASH', amountPaise: 50_000, entryCount: 2 },
      { method: 'upi', amountPaise: 30_000, entryCount: 1 },
      { method: 'CARD', amountPaise: 20_000, entryCount: 1 },
      { method: 'wallet', amountPaise: 5_000, entryCount: 1 },
    ]);
    assert.equal(out.cash, 50_000);
    assert.equal(out.upi, 30_000);
    assert.equal(out.card, 20_000);
    assert.equal(sumCollections(out), 100_000);
  });

  it('collectionsVsSalesFromParts computes variance', () => {
    const result = collectionsVsSalesFromParts(120_000, 100_000);
    assert.equal(result.collectionsTodayPaise, 120_000);
    assert.equal(result.salesTodayPaise, 100_000);
    assert.equal(result.variancePaise, 20_000);
  });

  it('buildMonthlyTrend zero-fills missing days', () => {
    const revenueByDay = new Map<string, number>([
      ['2026-07-28', 10_000],
      ['2026-07-30', 25_000],
    ]);
    const trend = buildMonthlyTrend(['2026-07-28', '2026-07-29', '2026-07-30'], revenueByDay);
    assert.deepEqual(trend, [
      { dayKey: '2026-07-28', revenuePaise: 10_000 },
      { dayKey: '2026-07-29', revenuePaise: 0 },
      { dayKey: '2026-07-30', revenuePaise: 25_000 },
    ]);
  });

  it('lastNDayKeys returns consecutive salon day keys ending on anchor', () => {
    const keys = lastNDayKeys('2026-07-30', 3);
    assert.deepEqual(keys, ['2026-07-28', '2026-07-29', '2026-07-30']);
  });
});
