import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRegisterFiltersFromSearchParams } from '@/src/hair/services/invoiceRegisterQueries';

describe('parseRegisterFiltersFromSearchParams', () => {
  it('parses pagination and filters', () => {
    const filters = parseRegisterFiltersFromSearchParams({
      q: 'FYH-001',
      from: '2026-04-01',
      to: '2026-04-30',
      customer: 'Priya',
      mobile: '98',
      invoiceNumber: 'FYH',
      paymentMode: 'upi',
      status: 'paid',
      page: '2',
      pageSize: '25',
      sort: 'grand_total_paise',
      sortDir: 'asc',
    });

    assert.equal(filters.q, 'FYH-001');
    assert.equal(filters.customer, 'Priya');
    assert.equal(filters.paymentMode, 'upi');
    assert.equal(filters.status, 'paid');
    assert.equal(filters.page, 2);
    assert.equal(filters.pageSize, 25);
    assert.equal(filters.sort, 'grand_total_paise');
    assert.equal(filters.sortDir, 'asc');
    assert.equal(filters.from?.toISOString().slice(0, 10), '2026-04-01');
    assert.equal(filters.to?.toISOString().slice(0, 10), '2026-04-30');
  });

  it('defaults page and pageSize', () => {
    const filters = parseRegisterFiltersFromSearchParams({});
    assert.equal(filters.page, 1);
    assert.equal(filters.pageSize, 50);
    assert.equal(filters.sort, 'created_at');
    assert.equal(filters.sortDir, 'desc');
  });
});
