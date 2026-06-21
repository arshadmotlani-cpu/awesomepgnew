import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildInvoiceDocumentLineItems,
  buildInvoiceDocumentStayDates,
  computeInvoiceDocumentTotals,
} from '../../src/lib/billing/invoiceDocumentModel';
import type { InvoiceBreakdown } from '../../src/db/schema/financialInvoices';

test('open-ended stay shows notice note', () => {
  const stay = buildInvoiceDocumentStayDates({
    durationMode: 'open_ended',
    stayRangeRaw: '[2026-06-01,)',
  });
  assert.ok(stay);
  assert.equal(stay.isOpenEnded, true);
  assert.match(stay.displayLabel, /Continue living \(open-ended\)/);
  assert.match(stay.noticeNote ?? '', /14-day notice/);
});

test('fixed stay shows check-in and check-out', () => {
  const stay = buildInvoiceDocumentStayDates({
    durationMode: 'monthly',
    stayRangeRaw: '[2026-06-01,2026-07-01)',
  });
  assert.ok(stay);
  assert.equal(stay.isOpenEnded, false);
  assert.ok(stay.checkIn?.includes('2026'));
  assert.ok(stay.checkOut?.includes('2026'));
  assert.match(stay.displayLabel, /2026/);
});

test('line items from breakdown with rent period', () => {
  const breakdown: InvoiceBreakdown = {
    rentPaise: 600000,
    lines: [{ kind: 'rent', label: 'June rent', amountPaise: 600000 }],
  };
  const items = buildInvoiceDocumentLineItems(breakdown, '2026-06-01');
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'June rent');
  assert.equal(items[0].period, 'June 2026');
  assert.equal(items[0].subtitle, 'Monthly accommodation charge');
});

test('totals compute balance due for sent invoice', () => {
  const items = buildInvoiceDocumentLineItems(
    { lines: [{ kind: 'rent', label: 'Rent', amountPaise: 500000 }] },
    '2026-06-01',
  );
  const totals = computeInvoiceDocumentTotals({
    amountPaise: 500000,
    status: 'sent',
    breakdown: { rentPaise: 500000 },
    lineItems: items,
  });
  assert.equal(totals.subtotalPaise, 500000);
  assert.equal(totals.balanceDuePaise, 500000);
});

test('paid invoice has zero balance due', () => {
  const items = buildInvoiceDocumentLineItems(
    { lines: [{ kind: 'rent', label: 'Rent', amountPaise: 500000 }], paidPaise: 500000 },
    '2026-06-01',
  );
  const totals = computeInvoiceDocumentTotals({
    amountPaise: 500000,
    status: 'paid',
    breakdown: { rentPaise: 500000, paidPaise: 500000 },
    lineItems: items,
  });
  assert.equal(totals.paidPaise, 500000);
  assert.equal(totals.balanceDuePaise, 0);
});
