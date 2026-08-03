import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOwnerDashboard, formatOwnerKpiValue } from '@/src/services/ownerDashboard';
import type { OverviewReportingSnapshot } from '@/src/services/overviewReportingService';
import type { RevenueByPgRow } from '@/src/services/revenueCommandCenter';

function samplePgRow(overrides: Partial<RevenueByPgRow> & { pgId: string; pgName: string }): RevenueByPgRow {
  return {
    occupancyPct: 80,
    occupiedBeds: 8,
    totalBeds: 10,
    rentRevenuePaise: 100_000,
    electricityRevenuePaise: 20_000,
    depositCollectedPaise: 50_000,
    depositHeldPaise: 120_000,
    lateFeePaise: 0,
    otherIncomePaise: 0,
    depositPaidCount: 1,
    depositPendingCount: 0,
    depositRequirementMissingCount: 0,
    totalRevenuePaise: 120_000,
    ...overrides,
  };
}

function sampleSnapshot(overrides: Partial<OverviewReportingSnapshot> = {}): OverviewReportingSnapshot {
  return {
    billingMonth: '2026-06-01',
    monthLabel: 'June 2026',
    invoiceSnapshot: {
      allOpenRent: [],
      allOpenElectricity: [],
      rentWaiting: [{ pgId: 'pg-1', outstandingPaise: 5_000 } as never],
      electricityWaiting: [],
      rentInReview: [],
      electricityInReview: [],
    },
    invoiceOutstanding: {
      pendingRentInvoices: 1,
      pendingRentInvoicesPaise: 5_000,
      pendingElectricityInvoices: 0,
      pendingElectricityInvoicesPaise: 0,
      totalOutstandingPaise: 5_000,
    },
    rentStats: {
      pendingCount: 1,
      overdueCount: 1,
      paidCount: 10,
      cancelledCount: 0,
      totalRentPaise: 0,
      collectedPaise: 500_000,
      outstandingPaise: 5_000,
    },
    revenue: {
      billingMonth: '2026-06-01',
      today: { totalPaise: 0, rentPaise: 0, electricityPaise: 0, depositPaise: 0 },
      mtd: {
        totalPaise: 600_000,
        rentPaise: 500_000,
        electricityPaise: 80_000,
        depositPaise: 20_000,
        lateFeePaise: 2_000,
        otherIncomePaise: 5_000,
        depositRefundedPaise: 0,
        netInflowPaise: 600_000,
      },
      collectionsByMode: { upiPaise: 0, cashPaise: 0, bankTransferPaise: 0, otherPaise: 0, totalPaise: 0 },
      depositPortfolio: {
        billingMonth: '2026-06-01',
        collectedAllTimePaise: 0,
        collectedMtdPaise: 0,
        heldPaise: 810_000,
        refundedAllTimePaise: 0,
        refundedMtdPaise: 0,
        residentDeductionsPaise: 0,
      },
      byPg: [samplePgRow({ pgId: 'pg-1', pgName: 'Central PG' })],
      outstanding: {
        pendingRentInvoices: 1,
        pendingRentInvoicesPaise: 5_000,
        pendingElectricityInvoices: 0,
        pendingElectricityInvoicesPaise: 0,
        pendingDepositPaise: 810_000,
        pendingPaymentApprovals: 2,
        pendingPaymentApprovalsPaise: 3_000,
        totalOutstandingPaise: 5_000,
      },
      billingMetrics: {
        billingMonth: '2026-06-01',
        collectedMtdPaise: 600_000,
        outstandingPaise: 5_000,
        collectionRatePct: 99,
      },
    },
    billingCenter: {
      reconciliation: null,
      reconciliationError: null,
      totalOutstandingPaise: 5_000,
      overdueCount: 1,
      cards: [],
    } as never,
    operationsQueueCounts: {
      rent_due: 0,
      electricity_due: 1,
      deposit_due: 0,
      refund_due: 2,
      waiting_for_approval: 3,
      vacating_requests: 1,
      booking_approval: 0,
      kyc_review: 1,
      all: 0,
    },
    dashboard: {
      totalPgs: 1,
      totalFloors: 2,
      totalRooms: 10,
      totalBeds: 10,
      occupiedBeds: 8,
      availableBeds: 2,
      blockedBeds: 0,
      maintenanceBeds: 0,
      occupancyPct: 80,
    },
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
    activeTenants: 8,
    upcomingCheckins: 0,
    moveOutPipeline: { counts: { bedsReleasing30Days: 1 }, stages: [] } as never,
    pgCount: 1,
    ...overrides,
  };
}

test('buildOwnerDashboard maps security deposits held from ledger SSOT', () => {
  const data = buildOwnerDashboard(sampleSnapshot());
  const depositKpi = data.kpis.find((k) => k.id === 'security_deposits_held');
  assert.ok(depositKpi);
  assert.equal(depositKpi.value, 810_000);
  assert.equal(depositKpi.kind, 'money');
});

test('buildOwnerDashboard maps operating revenue MTD', () => {
  const data = buildOwnerDashboard(sampleSnapshot());
  const rev = data.kpis.find((k) => k.id === 'operating_revenue_mtd');
  assert.ok(rev);
  assert.equal(rev.value, 600_000);
});

test('buildOwnerDashboard aggregates pending approvals from ops counts', () => {
  const data = buildOwnerDashboard(sampleSnapshot());
  const approvals = data.kpis.find((k) => k.id === 'pending_approvals');
  assert.ok(approvals);
  assert.equal(approvals.value, 4);
});

test('buildOwnerDashboard PG cards include deposit held and outstanding', () => {
  const data = buildOwnerDashboard(sampleSnapshot());
  assert.equal(data.pgCards.length, 1);
  assert.equal(data.pgCards[0]!.depositHeldPaise, 120_000);
  assert.equal(data.pgCards[0]!.outstandingPaise, 5_000);
});

test('formatOwnerKpiValue formats money in INR', () => {
  assert.match(formatOwnerKpiValue('money', 100_000), /^₹/);
});
