import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBillingOperationsKpis,
  buildOverdueByBucket,
  buildUpcomingGenerationRows,
  classifyOverdueBucket,
  classifyUpcomingGenerationBucket,
  upcomingGenerationHighlight,
} from '../../src/lib/admin/billingOperationsPresentation';
import type { UpcomingRentResidentRow } from '../../src/services/billingUpcomingSchedule';

function upcomingRow(overrides: Partial<UpcomingRentResidentRow>): UpcomingRentResidentRow {
  return {
    bookingId: 'b1',
    customerId: 'c1',
    customerName: 'Alice',
    customerPhone: '9999999999',
    pgId: 'pg1',
    pgName: 'Test PG',
    roomNumber: '101',
    bedCode: 'A',
    bookingStatus: 'confirmed',
    billingDay: 5,
    issueDate: '2026-08-01',
    billingMonth: '2026-08-01',
    dueDate: '2026-08-05',
    expectedRentPaise: 100000,
    status: 'scheduled',
    invoiceId: null,
    ...overrides,
  };
}

describe('billingOperationsPresentation', () => {
  it('classifies upcoming generation buckets', () => {
    assert.equal(classifyUpcomingGenerationBucket('2026-08-01', '2026-08-01'), 'today');
    assert.equal(classifyUpcomingGenerationBucket('2026-08-03', '2026-08-01'), 'next_3');
    assert.equal(classifyUpcomingGenerationBucket('2026-08-07', '2026-08-01'), 'next_7');
    assert.equal(classifyUpcomingGenerationBucket('2026-08-09', '2026-08-01'), null);
  });

  it('highlights upcoming generation urgency', () => {
    assert.equal(upcomingGenerationHighlight('2026-08-01', '2026-08-01'), 'red');
    assert.equal(upcomingGenerationHighlight('2026-08-02', '2026-08-01'), 'orange');
    assert.equal(upcomingGenerationHighlight('2026-08-05', '2026-08-01'), 'yellow');
    assert.equal(upcomingGenerationHighlight('2026-08-10', '2026-08-01'), null);
  });

  it('builds upcoming rows sorted by generation date', () => {
    const rows = buildUpcomingGenerationRows({
      scheduleResidents: [
        upcomingRow({ issueDate: '2026-08-03', customerName: 'Bob' }),
        upcomingRow({ issueDate: '2026-08-01', customerName: 'Alice' }),
      ],
      depositHeldByBooking: new Map([['b1', 50000]]),
      outstandingByBooking: new Map([['b1', 10000]]),
      todayIso: '2026-08-01',
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.issueDate, '2026-08-01');
    assert.equal(rows[0]?.depositHeldPaise, 50000);
    assert.equal(rows[0]?.currentOutstandingPaise, 10000);
  });

  it('groups overdue invoices by day buckets', () => {
    const overdue = buildOverdueByBucket(
      [
        {
          id: '1',
          customerId: 'c1',
          customerFullName: 'Alice',
          customerPhone: '1',
          pgId: 'pg1',
          pgName: 'PG',
          roomNumber: '1',
          bookingId: 'b1',
          invoiceNumber: 'R-1',
          generatedDate: '2026-07-01',
          dueDate: '2026-07-30',
          daysOutstanding: 2,
          amountDuePaise: 1000,
          lastReminderSentAt: null,
          reminderCount: 0,
          paymentStatus: 'overdue',
          financialInvoiceId: null,
        },
        {
          id: '2',
          customerId: 'c2',
          customerFullName: 'Bob',
          customerPhone: '2',
          pgId: 'pg1',
          pgName: 'PG',
          roomNumber: '2',
          bookingId: 'b2',
          invoiceNumber: 'R-2',
          generatedDate: '2026-07-01',
          dueDate: '2026-07-10',
          daysOutstanding: 20,
          amountDuePaise: 2000,
          lastReminderSentAt: null,
          reminderCount: 1,
          paymentStatus: 'overdue',
          financialInvoiceId: null,
        },
      ],
      '2026-08-01',
    );

    assert.equal(overdue['1-3'].length, 1);
    assert.equal(overdue['15+'].length, 1);
    assert.equal(classifyOverdueBucket(2), '1-3');
    assert.equal(classifyOverdueBucket(20), '15+');
  });

  it('builds KPI totals from sections', () => {
    const kpis = buildBillingOperationsKpis({
      upcomingGeneration: [
        {
          ...upcomingRow({ issueDate: '2026-08-01' }),
          depositHeldPaise: 0,
          currentOutstandingPaise: 0,
          bucket: 'today',
          highlight: 'red',
          billingCycleLabel: 'Day 5 of month',
        },
      ],
      pendingPayments: [
        {
          id: 'p1',
          customerId: 'c1',
          customerFullName: 'Alice',
          customerPhone: '1',
          pgId: 'pg1',
          pgName: 'PG',
          roomNumber: '1',
          bookingId: 'b1',
          invoiceNumber: 'R-1',
          generatedDate: '2026-07-01',
          dueDate: '2026-07-30',
          daysOutstanding: 2,
          amountDuePaise: 5000,
          lastReminderSentAt: null,
          reminderCount: 0,
          paymentStatus: 'pending',
          financialInvoiceId: null,
        },
      ],
      overdueByBucket: buildOverdueByBucket(
        [
          {
            id: 'p1',
            customerId: 'c1',
            customerFullName: 'Alice',
            customerPhone: '1',
            pgId: 'pg1',
            pgName: 'PG',
            roomNumber: '1',
            bookingId: 'b1',
            invoiceNumber: 'R-1',
            generatedDate: '2026-07-01',
            dueDate: '2026-07-30',
            daysOutstanding: 2,
            amountDuePaise: 5000,
            lastReminderSentAt: null,
            reminderCount: 0,
            paymentStatus: 'overdue',
            financialInvoiceId: null,
          },
        ],
        '2026-08-01',
      ),
      recentlyPaid: [],
      todayIso: '2026-08-01',
    });

    assert.equal(kpis.billsGeneratingToday, 1);
    assert.equal(kpis.pendingCollectionsCount, 1);
    assert.equal(kpis.overdueCollectionsCount, 1);
  });
});
