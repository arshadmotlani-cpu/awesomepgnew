import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCollectionsCalendarDays } from '../../src/services/collectionsCalendar';
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
    dueDate: '2026-07-15',
    rentPaise: 100000,
    discountPaise: 0,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: 'pending',
    paidAt: null,
    createdAt: new Date('2026-07-01'),
    notes: null,
    paymentProvider: null,
    outstandingPaise: 100000,
    effectiveStatus: 'pending',
    ...overrides,
  };
}

test('buildCollectionsCalendarDays aggregates due/paid/upcoming by day', () => {
  const days = buildCollectionsCalendarDays({
    month: '2026-07',
    openRent: [
      rentRow({ id: '1', dueDate: '2026-07-15', outstandingPaise: 50000 }),
      rentRow({
        id: '2',
        dueDate: '2026-07-15',
        status: 'payment_in_progress',
        effectiveStatus: 'payment_in_progress',
        outstandingPaise: 20000,
      }),
    ],
    paidRent: [
      rentRow({
        id: '3',
        status: 'paid',
        effectiveStatus: 'paid',
        outstandingPaise: 0,
        rentPaise: 30000,
        paidAt: new Date('2026-07-15T12:00:00+05:30'),
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
        billingDay: 20,
        monthlyRentPaise: 10000,
        nextDueDate: '2026-07-20',
        daysRemaining: 5,
        openInvoiceId: null,
        isUpcoming: true as const,
        expectedRentPaise: 10000,
      },
    ],
  });

  assert.equal(days.length, 31);
  const d15 = days.find((d) => d.date === '2026-07-15')!;
  assert.equal(d15.dueCount, 1);
  assert.equal(d15.duePaise, 50000);
  assert.equal(d15.awaitingCount, 1);
  assert.equal(d15.paidCount, 1);
  assert.equal(d15.paidPaise, 30000);
  const d20 = days.find((d) => d.date === '2026-07-20')!;
  assert.equal(d20.upcomingCount, 1);
  assert.equal(d20.upcomingPaise, 10000);
});
