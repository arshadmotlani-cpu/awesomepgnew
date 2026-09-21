import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  accumulateTenderRow,
  buildSalesBreakdown,
  computeNetContributionPaise,
  computePreviousPeriod,
  emptyTenderBreakdown,
  parseLocationIdsParam,
} from '../../../src/hair/services/revenueDashboardReport';

describe('revenueDashboardReport pure helpers', () => {
  it('computePreviousPeriod shifts range backward by same duration', () => {
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-11T00:00:00.000Z');
    const { previousFrom, previousTo } = computePreviousPeriod(from, to);
    assert.equal(previousTo.getTime(), from.getTime());
    assert.equal(previousFrom.getTime(), from.getTime() - (to.getTime() - from.getTime()));
  });

  it('computeNetContributionPaise subtracts direct cost from gross sales', () => {
    assert.equal(computeNetContributionPaise(100_000, 80_000), 20_000);
    assert.equal(computeNetContributionPaise(500, 800), 0);
  });

  it('buildSalesBreakdown sums categories', () => {
    const map = new Map([
      ['service', 7000],
      ['product', 3000],
    ]);
    const sales = buildSalesBreakdown(map);
    assert.equal(sales.netServicePaise, 7000);
    assert.equal(sales.productPaise, 3000);
    assert.equal(sales.totalPaise, 10_000);
    assert.equal(sales.giftCardPaise, 0);
  });

  it('accumulateTenderRow buckets wallet methods and excludes wallet from cash', () => {
    let t = emptyTenderBreakdown();
    t = accumulateTenderRow(t, 'cash', 'cash', 1000);
    t = accumulateTenderRow(t, 'upi', 'upi', 2000);
    t = accumulateTenderRow(t, 'bank', null, 500);
    assert.equal(t.cashPaise, 1000);
    assert.equal(t.upiPaise, 2000);
    assert.equal(t.otherPaise, 500);
    assert.equal(t.totalPaise, 3500);
  });

  it('parseLocationIdsParam', () => {
    assert.equal(parseLocationIdsParam(null), 'all');
    assert.equal(parseLocationIdsParam('all'), 'all');
    assert.deepEqual(parseLocationIdsParam('a,b'), ['a', 'b']);
  });
});
