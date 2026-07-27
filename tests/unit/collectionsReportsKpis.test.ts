import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateCollectionsReportKpis,
  projectedRowsFromAdminInvoices,
} from '../../src/services/collectionsReports';
import type { AdminRentInvoiceRow } from '../../src/db/queries/admin';

function rentRow(overrides: Partial<AdminRentInvoiceRow>): AdminRentInvoiceRow {
  return {
    id: 'inv-1',
    invoiceNumber: 'R-1',
    bookingId: 'b1',
    bookingCode: 'BK-1',
    customerId: 'c1',
    customerFullName: 'Ada',
    customerPhone: '9999999999',
    pgId: 'pg1',
    pgName: 'PG',
    bedCode: 'A',
    roomNumber: '101',
    billingMonth: '2026-07-01',
    dueDate: '2026-07-28',
    rentPaise: 1_000_000,
    discountPaise: 0,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: 'pending',
    paidAt: null,
    createdAt: new Date('2026-07-01'),
    notes: null,
    paymentProvider: null,
    outstandingPaise: 1_000_000,
    effectiveStatus: 'pending',
    ...overrides,
  };
}

test('aggregateCollectionsReportKpis — Expected/Collected/Outstanding/Overdue/efficiency', () => {
  const agg = aggregateCollectionsReportKpis([
    {
      outstandingPaise: 50_000,
      collectedPaise: 0,
      overduePaise: 50_000,
      expectedPaise: 50_000,
    },
    {
      outstandingPaise: 30_000,
      collectedPaise: 0,
      overduePaise: 0,
      expectedPaise: 30_000,
    },
    {
      outstandingPaise: 0,
      collectedPaise: 20_000,
      overduePaise: 0,
      expectedPaise: 20_000,
    },
  ]);

  assert.equal(agg.expectedPaise, 100_000);
  assert.equal(agg.collectedPaise, 20_000);
  assert.equal(agg.outstandingPaise, 80_000);
  assert.equal(agg.overduePaise, 50_000);
  assert.equal(agg.efficiencyPct, 20);
});

test('aggregateCollectionsReportKpis — empty → null efficiency', () => {
  const agg = aggregateCollectionsReportKpis([]);
  assert.equal(agg.efficiencyPct, null);
  assert.equal(agg.expectedPaise, 0);
});

test('projectedRowsFromAdminInvoices maps RFE fields only', () => {
  const rows = projectedRowsFromAdminInvoices({
    todayIso: '2026-07-28',
    open: [
      rentRow({ id: 'o1', dueDate: '2026-07-20', outstandingPaise: 50_000 }),
      rentRow({ id: 'd1', dueDate: '2026-07-28', outstandingPaise: 30_000 }),
    ],
    paid: [
      rentRow({
        id: 'p1',
        status: 'paid',
        effectiveStatus: 'paid',
        outstandingPaise: 0,
        rentPaise: 20_000,
        paidAt: new Date('2026-07-28T10:00:00+05:30'),
      }),
    ],
  });

  const agg = aggregateCollectionsReportKpis(rows);
  assert.equal(agg.outstandingPaise, 80_000);
  assert.equal(agg.overduePaise, 50_000);
  assert.equal(agg.collectedPaise, 20_000);
  assert.equal(agg.expectedPaise, 100_000);
});
