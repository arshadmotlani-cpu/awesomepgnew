import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  invoiceRegisterNavigateDay,
  shiftInvoiceRegisterDayIso,
} from '@/src/hair/lib/billing/invoiceRegisterDayNav';
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

describe('invoiceRegister day navigation', () => {
  const fallback = '2026-09-16';

  it('single day: previous and next', () => {
    assert.deepEqual(
      invoiceRegisterNavigateDay({
        from: '2026-09-16',
        to: '2026-09-16',
        direction: -1,
        fallbackDayIso: fallback,
      }),
      { from: '2026-09-15', to: '2026-09-15' },
    );
    assert.deepEqual(
      invoiceRegisterNavigateDay({
        from: '2026-09-16',
        to: '2026-09-16',
        direction: 1,
        fallbackDayIso: fallback,
      }),
      { from: '2026-09-17', to: '2026-09-17' },
    );
  });

  it('crosses month boundaries', () => {
    assert.equal(shiftInvoiceRegisterDayIso('2026-09-01', -1), '2026-08-31');
    assert.equal(shiftInvoiceRegisterDayIso('2026-09-30', 1), '2026-10-01');
  });

  it('multi-day range: prev collapses to day before from; next to day after to', () => {
    assert.deepEqual(
      invoiceRegisterNavigateDay({
        from: '2026-09-10',
        to: '2026-09-16',
        direction: -1,
        fallbackDayIso: fallback,
      }),
      { from: '2026-09-09', to: '2026-09-09' },
    );
    assert.deepEqual(
      invoiceRegisterNavigateDay({
        from: '2026-09-10',
        to: '2026-09-16',
        direction: 1,
        fallbackDayIso: fallback,
      }),
      { from: '2026-09-17', to: '2026-09-17' },
    );
  });
});
