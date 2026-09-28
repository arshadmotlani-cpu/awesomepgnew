import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyInvoiceRegisterSearchPatch,
  invoiceRegisterNavigateDay,
  isStaleInvoiceRegisterNavigation,
  shiftInvoiceRegisterDayIso,
} from '@/src/hair/lib/billing/invoiceRegisterDayNav';
import { zonedLocalToUtc } from '@/src/hair/lib/salonTime';
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
    const start = zonedLocalToUtc('2026-04-01T00:00:00', 'Asia/Kolkata');
    const end = zonedLocalToUtc('2026-05-01T00:00:00', 'Asia/Kolkata');
    assert.equal(filters.from?.toISOString(), start.toISOString());
    assert.equal(filters.to?.toISOString(), end.toISOString());
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

  it('walks backward one calendar day at a time from the latest range', () => {
    let state: Record<string, string> = { from: '2026-09-28', to: '2026-09-28' };
    for (const day of ['2026-09-27', '2026-09-26', '2026-09-25']) {
      const next = invoiceRegisterNavigateDay({
        from: state.from,
        to: state.to,
        direction: -1,
        fallbackDayIso: '2026-09-28',
      });
      state = applyInvoiceRegisterSearchPatch(state, {
        from: next.from,
        to: next.to,
        all: undefined,
        page: '1',
      });
      assert.equal(state.from, day);
      assert.equal(state.to, day);
      assert.ok(state.from <= state.to);
    }
  });

  it('clears the date range without restoring the previous day', () => {
    const cleared = applyInvoiceRegisterSearchPatch(
      { from: '2026-09-28', to: '2026-09-28', nav: '3' },
      { from: undefined, to: undefined, all: '1', page: '1' },
    );
    assert.equal(cleared.from, undefined);
    assert.equal(cleared.to, undefined);
    assert.equal(cleared.all, '1');
    assert.ok(Number(cleared.nav) > 3);
  });

  it('does not let an older navigation overwrite the selected day', () => {
    const first = applyInvoiceRegisterSearchPatch(
      { from: '2026-09-28', to: '2026-09-28' },
      { from: '2026-09-27', to: '2026-09-27', page: '1' },
    );
    const second = applyInvoiceRegisterSearchPatch(first, {
      from: '2026-09-26',
      to: '2026-09-26',
      page: '1',
    });
    assert.equal(isStaleInvoiceRegisterNavigation(second, first), true);
    assert.equal(isStaleInvoiceRegisterNavigation(second, second), false);
    assert.equal(second.from, '2026-09-26');
    assert.equal(second.to, '2026-09-26');
  });

  it('swaps a reversed from/to pair instead of querying an empty range', () => {
    const filters = parseRegisterFiltersFromSearchParams(
      { from: '2026-09-28', to: '2026-09-27' },
      'Asia/Kolkata',
    );
    const noon = zonedLocalToUtc('2026-09-27T12:00:00', 'Asia/Kolkata');
    assert.ok(filters.from && filters.to && filters.from < filters.to);
    assert.ok(noon >= filters.from && noon < filters.to);
  });

  it('matches a salon calendar day and excludes the neighboring days', () => {
    const selected = parseRegisterFiltersFromSearchParams(
      { from: '2026-09-28', to: '2026-09-28' },
      'Asia/Kolkata',
    );
    const emptyDay = parseRegisterFiltersFromSearchParams(
      { from: '2026-09-26', to: '2026-09-26' },
      'Asia/Kolkata',
    );
    const invoiceAt = zonedLocalToUtc('2026-09-28T10:00:00', 'Asia/Kolkata');
    assert.ok(selected.from && selected.to);
    assert.ok(invoiceAt >= selected.from && invoiceAt < selected.to);
    assert.ok(emptyDay.from && emptyDay.to);
    assert.equal(invoiceAt >= emptyDay.from && invoiceAt < emptyDay.to, false);
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
