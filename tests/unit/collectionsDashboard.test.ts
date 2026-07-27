import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCollectionsBuckets,
  buildCollectionsKpis,
  classifyOpenRentRow,
} from '../../src/services/collectionsDashboard';
import { filterUpcomingWithinDays } from '../../src/services/collectionsUpcoming';
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

test('classifyOpenRentRow buckets overdue, due today, awaiting', () => {
  assert.deepEqual(classifyOpenRentRow(rentRow({ dueDate: '2026-07-20', effectiveStatus: 'overdue' }), '2026-07-28'), {
    bucket: 'overdue',
    label: 'Overdue',
  });
  assert.deepEqual(classifyOpenRentRow(rentRow({ dueDate: '2026-07-28' }), '2026-07-28'), {
    bucket: 'due_today',
    label: 'Awaiting Payment',
  });
  assert.deepEqual(
    classifyOpenRentRow(
      rentRow({ status: 'payment_in_progress', effectiveStatus: 'payment_in_progress' }),
      '2026-07-28',
    ),
    { bucket: 'awaiting', label: 'Under Verification' },
  );
  assert.equal(
    classifyOpenRentRow(rentRow({ dueDate: '2026-08-05', outstandingPaise: 0, effectiveStatus: 'paid' }), '2026-07-28'),
    null,
  );
});

test('buildCollectionsBuckets + KPIs from projected rows', () => {
  const paidAt = new Date('2026-07-28T10:00:00+05:30');
  const buckets = buildCollectionsBuckets({
    todayIso: '2026-07-28',
    openRent: [
      rentRow({ id: 'o1', dueDate: '2026-07-20', effectiveStatus: 'overdue', outstandingPaise: 50000 }),
      rentRow({ id: 'd1', dueDate: '2026-07-28', outstandingPaise: 30000 }),
      rentRow({
        id: 'a1',
        status: 'payment_in_progress',
        effectiveStatus: 'payment_in_progress',
        outstandingPaise: 20000,
      }),
    ],
    paidRent: [
      rentRow({
        id: 'p1',
        status: 'paid',
        effectiveStatus: 'paid',
        outstandingPaise: 0,
        rentPaise: 40000,
        paidAt,
      }),
    ],
    upcoming: [
      {
        customerId: 'c2',
        customerName: 'Bob',
        phone: '888',
        bookingId: 'b2',
        pgId: 'pg1',
        pgName: 'PG',
        roomNumber: '102',
        bedCode: 'B',
        moveInDate: '2026-01-01',
        billingDay: 5,
        monthlyRentPaise: 10000,
        nextDueDate: '2026-08-01',
        daysRemaining: 4,
        openInvoiceId: null,
        isUpcoming: true as const,
        expectedRentPaise: 10000,
      },
    ],
  });

  assert.equal(buckets.overdue.length, 1);
  assert.equal(buckets.due_today.length, 1);
  assert.equal(buckets.awaiting.length, 1);
  assert.equal(buckets.paid_today.length, 1);
  assert.equal(buckets.upcoming.length, 1);

  const kpis = buildCollectionsKpis(buckets);
  assert.equal(kpis.overdueCount, 1);
  assert.equal(kpis.dueTodayCount, 1);
  assert.equal(kpis.awaitingCount, 1);
  assert.equal(kpis.paidTodayCount, 1);
  assert.equal(kpis.upcomingCount, 1);
  assert.equal(kpis.overduePaise, 50000);
  assert.equal(kpis.collectedPaise, 40000);
});

test('filterUpcomingWithinDays excludes open invoices and out-of-window dates', () => {
  const base = {
    customerId: 'c1',
    customerName: 'Ada',
    phone: '999',
    bookingId: 'b1',
    pgId: 'pg1',
    pgName: 'PG',
    roomNumber: '101',
    bedCode: 'A',
    moveInDate: '2026-01-01',
    billingDay: 5,
    monthlyRentPaise: 10000,
    daysRemaining: 3,
  };
  const rows = filterUpcomingWithinDays(
    [
      { ...base, nextDueDate: '2026-07-30', openInvoiceId: null },
      { ...base, bookingId: 'b2', nextDueDate: '2026-07-30', openInvoiceId: 'inv' },
      { ...base, bookingId: 'b3', nextDueDate: '2026-08-20', openInvoiceId: null },
      { ...base, bookingId: 'b4', nextDueDate: '2026-07-20', openInvoiceId: null },
    ],
    { today: '2026-07-28', withinDays: 7 },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.bookingId, 'b1');
  assert.equal(rows[0]!.isUpcoming, true);
});
