import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveRentBillingOverviewCounts,
  type RentBillingOverviewCounts,
} from '../../src/lib/billing/rentBillingOverview';
import {
  buildPendingCollectionRows,
  serializeBillingCentreDashboardViewForClient,
  type BillingCentreDashboardView,
} from '../../src/lib/admin/billingCentreDashboardPresentation';
import type { RentBillingOverviewRow } from '../../src/services/rentInvoices';

function overviewRow(
  overrides: Partial<RentBillingOverviewRow>,
): RentBillingOverviewRow {
  return {
    bookingId: 'b1',
    bookingCode: 'APG-1',
    customerId: 'c1',
    customerFullName: 'Test',
    customerPhone: '999',
    pgId: 'pg1',
    pgName: 'PG',
    roomNumber: '101',
    bedCode: 'A',
    checkInDate: '2026-10-01',
    expectedRentPaise: 100000,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: 'none',
    rentPaise: 0,
    dueDate: null,
    depositDuePaise: 0,
    depositCollectionStatus: 'collected',
    isDueForGeneration: true,
    roomCapacity: 2,
    roomOccupied: 1,
    roomTypeName: 'Double',
    ...overrides,
  };
}

describe('Billing Center page data boundary', () => {
  it('deriveRentBillingOverviewCounts handles paid, pending, overdue, and cancelled October rows', () => {
    const rows = [
      overviewRow({ bookingId: 'b-paid', invoiceStatus: 'paid', invoiceId: 'i1', isDueForGeneration: false }),
      overviewRow({ bookingId: 'b-pending', invoiceStatus: 'pending', invoiceId: 'i2', isDueForGeneration: false }),
      overviewRow({ bookingId: 'b-overdue', invoiceStatus: 'overdue', invoiceId: 'i3', isDueForGeneration: false }),
      overviewRow({
        bookingId: 'b-cancelled',
        invoiceStatus: 'cancelled',
        invoiceId: 'i4',
        isDueForGeneration: false,
      }),
      overviewRow({ bookingId: 'b-none', invoiceStatus: 'none', isDueForGeneration: true }),
    ];

    const counts: RentBillingOverviewCounts = deriveRentBillingOverviewCounts(rows);
    assert.equal(counts.candidateCount, 5);
    assert.equal(counts.generatedCount, 4);
    assert.equal(counts.pendingCount, 1);
    assert.equal(counts.needsBillCount, 1);
  });

  it('serializeBillingCentreDashboardViewForClient converts Date props for client components', () => {
    const paidAt = new Date('2026-10-02T10:30:00.000Z');
    const reminderAt = new Date('2026-10-01T08:00:00.000Z');

    const pending = buildPendingCollectionRows({
      queueItems: [],
      depositRows: [],
      reminderStats: new Map(),
      todayIso: '2026-10-02',
    });

    const view: BillingCentreDashboardView = {
      todayIso: '2026-10-02',
      summary: {
        collectedTodayPaise: 0,
        collectedTodayCount: 0,
        outstandingPaise: 0,
        upcomingBills7d: 0,
        residentsToRemind: 0,
        pendingApprovals: 0,
        vacatingThisWeek: 0,
      },
      commandCards: [],
      opsKpis: {
        collectedTodayPaise: 0,
        collectedTodayCount: 0,
        outstandingPaise: 0,
        overdueCount: 0,
        pendingPaymentCount: 0,
      },
      upcomingGeneration: [],
      generatedToday: [],
      generatedTodayTotalPaise: 0,
      pendingCollections: [
        {
          ...pending[0],
          kind: 'rent',
          id: 'r1',
          customerId: 'c1',
          customerName: 'Alice',
          customerPhone: '999',
          pgId: 'pg1',
          pgName: 'PG',
          roomNumber: '101',
          bookingId: 'b1',
          invoiceNumber: 'R-1',
          amountPaise: 100,
          dueDate: '2026-10-15',
          daysOverdue: 0,
          priority: 'pending',
          paymentStatus: 'pending',
          financialInvoiceId: null,
          lastReminderSentAt: reminderAt.toISOString(),
          reminderCount: 1,
        },
      ],
      recentlyPaid: [
        {
          id: 'p1',
          kind: 'rent',
          customerId: 'c1',
          customerFullName: 'Alice',
          customerPhone: '999',
          pgName: 'PG',
          roomNumber: '101',
          bedCode: 'A',
          amountPaise: 50000,
          invoiceNumber: 'R-1',
          paymentMode: 'UPI',
          paymentStatus: 'paid',
          paidAt,
        },
      ],
      pendingApprovals: [],
      pgs: [{ id: 'pg1', name: 'PG' }],
    };

    const serialized = serializeBillingCentreDashboardViewForClient({
      ...view,
      pendingCollections: view.pendingCollections.map((r) => ({
        ...r,
        lastReminderSentAt: reminderAt,
      })),
    });

    assert.equal(typeof serialized.recentlyPaid[0]?.paidAt, 'string');
    assert.equal(serialized.recentlyPaid[0]?.paidAt, paidAt.toISOString());
    assert.equal(typeof serialized.pendingCollections[0]?.lastReminderSentAt, 'string');
    assert.equal(
      serialized.pendingCollections[0]?.lastReminderSentAt,
      reminderAt.toISOString(),
    );
  });
});
