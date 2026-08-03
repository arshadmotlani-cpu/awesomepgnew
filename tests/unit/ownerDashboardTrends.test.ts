import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOwnerDashboard } from '../../src/services/ownerDashboard.ts';
import {
  emptyOwnerDashboardTrends,
  finRollupFromSnapshot,
} from '../../src/services/ownerDashboardTrends.ts';

test('finRollupFromSnapshot returns null for missing financial block', () => {
  assert.equal(finRollupFromSnapshot({}), null);
  assert.equal(finRollupFromSnapshot(null), null);
  assert.equal(finRollupFromSnapshot({ financial: null }), null);
});

test('finRollupFromSnapshot reads partial financial rollup', () => {
  const fin = finRollupFromSnapshot({
    financial: {
      rentPrincipalPaise: 1000,
      operatingRevenuePaise: 5000,
    },
  });
  assert.ok(fin);
  assert.equal(fin!.rentPrincipalPaise, 1000);
  assert.equal(fin!.electricityPaise, 0);
  assert.equal(fin!.operatingRevenuePaise, 5000);
});

test('emptyOwnerDashboardTrends returns 12 zero months', () => {
  const trends = emptyOwnerDashboardTrends('2026-08-01', []);
  assert.equal(trends.revenueTrend.length, 12);
  assert.equal(trends.occupancyTrend.length, 12);
  assert.equal(trends.revenueTrend.every((p) => p.operatingRevenuePaise === 0), true);
});

test('buildOwnerDashboard tolerates missing moveOutPipeline and byPg', () => {
  const base = {
    billingMonth: '2026-08-01',
    monthLabel: 'August 2026',
    invoiceSnapshot: { rentWaiting: [], electricityWaiting: [] },
    invoiceOutstanding: {
      pendingRentInvoices: 0,
      pendingRentInvoicesPaise: 0,
      pendingElectricityInvoices: 0,
      pendingElectricityInvoicesPaise: 0,
      totalOutstandingPaise: 0,
    },
    rentStats: null,
    revenue: {
      billingMonth: '2026-08-01',
      today: { totalPaise: 0, rentPaise: 0, electricityPaise: 0, depositPaise: 0 },
      mtd: {
        totalPaise: 0,
        rentPaise: 0,
        electricityPaise: 0,
        depositPaise: 0,
        lateFeePaise: 0,
        otherIncomePaise: 0,
        depositRefundedPaise: 0,
        netInflowPaise: 0,
      },
      collectionsByMode: { upiPaise: 0, cashPaise: 0, bankTransferPaise: 0, otherPaise: 0, totalPaise: 0 },
      depositPortfolio: {
        billingMonth: '2026-08-01',
        collectedAllTimePaise: 0,
        collectedMtdPaise: 0,
        heldPaise: 0,
        refundedAllTimePaise: 0,
        refundedMtdPaise: 0,
        residentDeductionsPaise: 0,
      },
      byPg: undefined,
      outstanding: {
        pendingRentInvoices: 0,
        pendingRentInvoicesPaise: 0,
        pendingElectricityInvoices: 0,
        pendingElectricityInvoicesPaise: 0,
        pendingDepositPaise: 0,
        pendingPaymentApprovals: 0,
        pendingPaymentApprovalsPaise: 0,
        totalOutstandingPaise: 0,
      },
      billingMetrics: {
        billingMonth: '2026-08-01',
        collectedMtdPaise: 0,
        outstandingPaise: 0,
        collectionRatePct: 0,
      },
    },
    billingCenter: { reconciliation: null, reconciliationError: null, totalOutstandingPaise: 0, overdueCount: 0, cards: [] },
    operationsQueueCounts: {
      rent_due: 0,
      electricity_due: 0,
      deposit_due: 0,
      refund_due: 0,
      waiting_for_approval: 0,
      vacating_requests: 0,
      booking_approval: 0,
      kyc_review: 0,
      all: 0,
    },
    dashboard: null,
    visitors: {
      today: 0,
      week: 0,
      month: 0,
      allTime: 0,
      uniqueToday: 0,
      uniqueWeek: 0,
      uniqueMonth: 0,
      uniqueAllTime: 0,
      returningToday: 0,
      returningWeek: 0,
      returningMonth: 0,
      returningAllTime: 0,
    },
    activeTenants: 0,
    upcomingCheckins: 0,
    moveOutPipeline: undefined,
    pgCount: 0,
  } as never;

  const data = buildOwnerDashboard(base);
  assert.deepEqual(data.pgCards, []);
  assert.equal(data.occupancyDistribution.moveOut, 0);
});
