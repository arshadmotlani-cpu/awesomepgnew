import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyBillingCentreDashboardFilters,
  buildApprovalRows,
  buildGeneratedTodayRows,
  buildPendingCollectionRows,
  buildSummaryCards,
  parseBillingCentreFilters,
  type BillingCentreDashboardView,
} from '../../src/lib/admin/billingCentreDashboardPresentation';
import type { CollectionQueueItem } from '../../src/lib/billing/collectionsQueue';
import type { UnifiedOpsItem } from '../../src/services/unifiedOperationsQueue';

function queueItem(overrides: Partial<CollectionQueueItem>): CollectionQueueItem {
  return {
    id: 'rent-1',
    kind: 'rent',
    sourceTable: 'rent_invoices',
    sourceId: 'inv-1',
    customerId: 'c1',
    customerFullName: 'Alice',
    customerPhone: '9999999999',
    pgId: 'pg1',
    pgName: 'Test PG',
    roomNumber: '101',
    bedCode: 'A',
    bookingId: 'b1',
    invoiceNumber: 'R-101',
    amountPaise: 100000,
    dueDate: '2026-08-05',
    daysOverdue: 0,
    priority: 'pending',
    effectiveStatus: 'pending',
    financialInvoiceId: null,
    ...overrides,
  };
}

function baseView(overrides: Partial<BillingCentreDashboardView> = {}): BillingCentreDashboardView {
  return {
    todayIso: '2026-08-01',
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
      billsGeneratingToday: 0,
      billsGeneratingThisWeek: 0,
      pendingCollectionsPaise: 0,
      pendingCollectionsCount: 0,
      overdueCollectionsPaise: 0,
      overdueCollectionsCount: 0,
      collectedTodayPaise: 0,
      collectedTodayCount: 0,
      collectedThisMonthPaise: 0,
      collectedThisMonthCount: 0,
    },
    upcomingGeneration: [],
    generatedToday: [],
    generatedTodayTotalPaise: 0,
    pendingCollections: [],
    recentlyPaid: [],
    pendingApprovals: [],
    pgs: [{ id: 'pg1', name: 'Test PG' }],
    ...overrides,
  };
}

describe('billingCentreDashboardPresentation', () => {
  it('parses URL filter params', () => {
    assert.equal(parseBillingCentreFilters({}).paidPeriod, 'today');
    assert.equal(parseBillingCentreFilters({ pg: 'pg1' }).pgId, 'pg1');
    assert.deepEqual(parseBillingCentreFilters({ pg: 'pg1', room: '101', resident: 'alice', paidPeriod: 'week' }), {
      pgId: 'pg1',
      roomQuery: '101',
      residentQuery: 'alice',
      paidPeriod: 'week',
    });
    assert.equal(parseBillingCentreFilters({ paidPeriod: 'invalid' }).paidPeriod, 'today');
  });

  it('builds generated today rows for rent, electricity, and deposit', () => {
    const rows = buildGeneratedTodayRows({
      rentRows: [
        {
          invoiceId: 'r1',
          invoiceNumber: 'R-1',
          customerId: 'c1',
          customerName: 'Alice',
          customerPhone: '999',
          pgId: 'pg1',
          pgName: 'PG',
          roomNumber: '101',
          rentPaise: 10000,
          electricityPaise: null,
          totalPaise: 10000,
          paymentStatus: 'pending',
          financialInvoiceId: 'fin-1',
        },
      ],
      electricityRows: [
        {
          id: 'e1',
          pgId: 'pg1',
          pgName: 'PG',
          roomNumber: '102',
          billingMonth: '2026-08-01',
          totalPaise: 5000,
        },
      ],
      depositRows: [
        {
          id: 'd1',
          bookingId: 'b1',
          customerId: 'c2',
          customerName: 'Bob',
          customerPhone: '888',
          pgId: 'pg1',
          pgName: 'PG',
          roomNumber: '103',
          amountPaise: 200000,
        },
      ],
    });

    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.kind).sort(),
      ['deposit', 'electricity', 'rent'],
    );
    assert.equal(rows.find((r) => r.kind === 'deposit')?.amountPaise, 200000);
  });

  it('merges pending collections without double-counting deposit due', () => {
    const rows = buildPendingCollectionRows({
      queueItems: [queueItem({ amountPaise: 50000 })],
      depositRows: [
        {
          bookingId: 'b2',
          bookingCode: 'BK2',
          customerId: 'c2',
          customerFullName: 'Govind',
          customerPhone: '777',
          pgId: 'pg1',
          pgName: 'PG',
          roomNumber: '201',
          bedCode: 'B',
          depositDuePaise: 206200,
          depositDueDate: '2026-07-01',
          depositCollectionStatus: 'pending',
        },
      ],
      reminderStats: new Map(),
      todayIso: '2026-08-01',
    });

    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.kind === 'deposit')?.amountPaise, 206200);
    assert.equal(rows.find((r) => r.kind === 'deposit')?.daysOverdue, 31);
  });

  it('builds approval rows from unified ops queue slices', () => {
    const items: UnifiedOpsItem[] = [
      {
        id: 'wfa-1',
        queue: 'waiting_for_approval',
        residentName: 'Alice',
        residentPhone: '999',
        pgId: 'pg1',
        pgName: 'PG',
        roomNumber: '101',
        bedCode: null,
        reason: 'Payment proof uploaded',
        openHref: '/admin/operations?filter=waiting_for_approval',
        openLabel: 'Review',
        amountPaise: 10000,
      },
      {
        id: 'other-1',
        queue: 'move_in_pending',
        residentName: 'Bob',
        pgName: null,
        roomNumber: null,
        bedCode: null,
        reason: 'Not approval',
        openHref: '/admin/operations',
        openLabel: 'Open',
      },
    ];

    const rows = buildApprovalRows(items);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.queueLabel, 'Payment proof');
    assert.equal(rows[0]?.pgId, 'pg1');
  });

  it('builds summary KPI cards from snapshot inputs', () => {
    const summary = buildSummaryCards({
      commandSnapshot: {
        cards: [],
        totalOutstandingPaise: 500000,
        totalCollectedPaise: 100000,
        reconciliation: null,
        reconciliationError: null,
        moveOutCount: 0,
      },
      operations: {
        todayIso: '2026-08-01',
        kpis: {
          billsGeneratingToday: 1,
          billsGeneratingThisWeek: 3,
          pendingCollectionsPaise: 200000,
          pendingCollectionsCount: 2,
          overdueCollectionsPaise: 50000,
          overdueCollectionsCount: 1,
          collectedTodayPaise: 75000,
          collectedTodayCount: 2,
          collectedThisMonthPaise: 300000,
          collectedThisMonthCount: 5,
        },
        upcomingGeneration: [
          {
            bookingId: 'b1',
            customerId: 'c1',
            customerName: 'Alice',
            customerPhone: '999',
            pgId: 'pg1',
            pgName: 'PG',
            roomNumber: '101',
            bedCode: 'A',
            issueDate: '2026-08-03',
            billingMonth: '2026-08-01',
            expectedRentPaise: 10000,
            depositHeldPaise: 0,
            currentOutstandingPaise: 0,
            status: 'scheduled',
            bucket: 'next_3',
            highlight: 'yellow',
            billingCycleLabel: 'Day 3',
          },
        ],
        generatedToday: [],
        pendingPayments: [],
        overdueByBucket: { '1-3': [], '4-7': [], '8-15': [], '15+': [] },
        recentlyPaid: [],
        pgs: [],
      },
      pendingCollections: [
        {
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
          amountPaise: 10000,
          dueDate: '2026-08-01',
          daysOverdue: 0,
          priority: 'pending',
          paymentStatus: 'pending',
          financialInvoiceId: null,
          lastReminderSentAt: null,
          reminderCount: 0,
        },
      ],
      approvalCount: 3,
      vacatingThisWeek: 2,
    });

    assert.equal(summary.collectedTodayPaise, 75000);
    assert.equal(summary.outstandingPaise, 500000);
    assert.equal(summary.upcomingBills7d, 1);
    assert.equal(summary.residentsToRemind, 1);
    assert.equal(summary.pendingApprovals, 3);
    assert.equal(summary.vacatingThisWeek, 2);
  });

  it('applies PG, room, resident, and paid-period filters', () => {
    const paidAtToday = new Date();
    const paidAtYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const view = baseView({
      generatedToday: [
        {
          kind: 'rent',
          id: 'g1',
          label: 'R-1',
          customerId: 'c1',
          customerName: 'Alice',
          customerPhone: '999',
          pgId: 'pg1',
          pgName: 'PG1',
          roomNumber: '101',
          amountPaise: 10000,
          paymentStatus: 'pending',
          financialInvoiceId: null,
          openHref: null,
        },
        {
          kind: 'rent',
          id: 'g2',
          label: 'R-2',
          customerId: 'c2',
          customerName: 'Bob',
          customerPhone: '888',
          pgId: 'pg2',
          pgName: 'PG2',
          roomNumber: '201',
          amountPaise: 20000,
          paymentStatus: 'pending',
          financialInvoiceId: null,
          openHref: null,
        },
      ],
      recentlyPaid: [
        {
          id: 'p1',
          kind: 'rent',
          customerId: 'c1',
          customerFullName: 'Alice',
          customerPhone: '999',
          pgName: 'PG1',
          roomNumber: '101',
          amountPaise: 10000,
          paidAt: paidAtToday,
          paymentMode: 'upi',
          collectedBy: 'Admin',
          invoiceNumber: 'R-1',
          billingMonth: '2026-08-01',
          paymentStatus: 'paid',
        },
        {
          id: 'p2',
          kind: 'rent',
          customerId: 'c2',
          customerFullName: 'Bob',
          customerPhone: '888',
          pgName: 'PG2',
          roomNumber: '201',
          amountPaise: 20000,
          paidAt: paidAtYesterday,
          paymentMode: 'cash',
          collectedBy: 'Admin',
          invoiceNumber: 'R-2',
          billingMonth: '2026-08-01',
          paymentStatus: 'paid',
        },
      ],
      pendingApprovals: [
        {
          id: 'a1',
          queue: 'kyc_review',
          queueLabel: 'KYC',
          residentName: 'Alice',
          residentPhone: '999',
          pgId: 'pg1',
          pgName: 'PG1',
          roomNumber: '101',
          amountPaise: null,
          reason: 'Docs pending',
          openHref: '/admin/operations',
          openLabel: 'Review',
        },
      ],
    });

    const filtered = applyBillingCentreDashboardFilters(view, {
      pgId: 'pg1',
      roomQuery: '101',
      residentQuery: 'alice',
      paidPeriod: 'today',
    });

    assert.equal(filtered.generatedToday.length, 1);
    assert.equal(filtered.generatedToday[0]?.customerName, 'Alice');
    assert.equal(filtered.generatedTodayTotalPaise, 10000);
    assert.equal(filtered.recentlyPaid.length, 1);
    assert.equal(filtered.recentlyPaid[0]?.customerFullName, 'Alice');
    assert.equal(filtered.pendingApprovals.length, 1);
  });
});
