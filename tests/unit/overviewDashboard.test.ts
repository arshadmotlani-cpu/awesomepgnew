import assert from 'node:assert/strict';
import test from 'node:test';
import { FEATURED_PG_PATTERNS } from '@/src/lib/admin/featuredPgs';
import {
  buildOverviewDashboard,
  formatOverviewMetricValue,
  selectFeaturedPropertyRows,
} from '@/src/services/overviewDashboard';
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
    lateFeePaise: 0,
    otherIncomePaise: 0,
    depositPaidCount: 1,
    depositPendingCount: 0,
    depositRequirementMissingCount: 0,
    totalRevenuePaise: 170_000,
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
      rentWaiting: [],
      electricityWaiting: [],
      rentInReview: [],
      electricityInReview: [],
    },
    invoiceOutstanding: {
      pendingRentInvoices: 3,
      pendingRentInvoicesPaise: 15_000,
      pendingElectricityInvoices: 2,
      pendingElectricityInvoicesPaise: 4_000,
      totalOutstandingPaise: 19_000,
    },
    rentStats: {
      pendingCount: 3,
      overdueCount: 2,
      paidCount: 10,
      cancelledCount: 0,
      totalRentPaise: 0,
      collectedPaise: 500_000,
      outstandingPaise: 15_000,
    },
    revenue: {
      billingMonth: '2026-06-01',
      today: { totalPaise: 10_000, rentPaise: 6_000, electricityPaise: 2_000, depositPaise: 2_000 },
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
        heldPaise: 0,
        refundedAllTimePaise: 0,
        refundedMtdPaise: 0,
        residentDeductionsPaise: 0,
      },
      outstanding: {
        pendingRentInvoices: 3,
        pendingRentInvoicesPaise: 15_000,
        pendingElectricityInvoices: 2,
        pendingElectricityInvoicesPaise: 4_000,
        pendingDepositPaise: 0,
        pendingPaymentApprovals: 0,
        pendingPaymentApprovalsPaise: 0,
        totalOutstandingPaise: 19_000,
      },
      byPg: [samplePgRow({ pgId: '1', pgName: 'SHANTINAGAR - AWESOME PG' })],
      billingMetrics: {
        rent: { generatedPaise: 0, collectedPaise: 0, pendingPaise: 0, overduePaise: 0 },
        electricity: { generatedPaise: 0, collectedPaise: 0, pendingPaise: 0, overduePaise: 0 },
        expectedRevenuePaise: 0,
        collectedRevenuePaise: 0,
      },
    },
    billingCenter: {
      billingMonth: '2026-06-01',
      rentWaitingCount: 3,
      electricityWaitingCount: 2,
      bothDueCount: 0,
      paymentReviewCount: 0,
      overdueCount: 2,
      moveOutCount: 0,
      kycReviewCount: 0,
      pendingInvoiceCount: 5,
      totalOutstandingPaise: 19_000,
      totalBilledPaise: 0,
      totalCollectedPaise: 0,
      collectionPct: 0,
      cards: [],
      hasUnpaidInvoices: true,
      reconciliation: null,
      reconciliationError: null,
    },
    operationsQueueCounts: {
      waiting_for_approval: 2,
      rent_due: 3,
      electricity_due: 4,
      vacating_requests: 1,
      refund_due: 2,
      booking_approval: 0,
      deposit_due: 1,
      kyc_review: 3,
    },
    dashboard: {
      totalPgs: 4,
      totalFloors: 8,
      totalRooms: 20,
      totalBeds: 40,
      occupiedBeds: 30,
      availableBeds: 10,
      blockedBeds: 1,
      maintenanceBeds: 2,
      occupancyPct: 75,
    },
    visitors: {
      allTime: 1000,
      uniqueAllTime: 800,
      today: 12,
      uniqueToday: 10,
      week: 90,
      uniqueWeek: 0,
      month: 300,
      uniqueMonth: 0,
      returningToday: 0,
      returningWeek: 0,
      returningMonth: 0,
      returningAllTime: 0,
    },
    activeTenants: 28,
    upcomingCheckins: 5,
    moveOutPipeline: {
      activeItems: [],
      approvalItems: [],
      settlementItems: [],
      moveOutNoticeItems: [],
      bedsReleasingItems: [],
      counts: {
        moveOutApprovalRequests: 1,
        moveOutNotices: 1,
        bedsReleasing30Days: 2,
        activeCheckoutSettlements: 0,
      },
      activeVacatingRequestIds: [],
    },
    pgCount: 4,
    ...overrides,
  };
}

test('selectFeaturedPropertyRows matches PGs by name pattern', () => {
  const rows = [
    samplePgRow({ pgId: '1', pgName: 'CENTRAL - AWESOME PG' }),
    samplePgRow({ pgId: '2', pgName: 'CENTRAL - AWESOME PG (Female)' }),
    samplePgRow({ pgId: '3', pgName: 'SHANTINAGAR - AWESOME PG' }),
    samplePgRow({ pgId: '4', pgName: 'TRIMURTI NAGAR - AWESOME PG' }),
    samplePgRow({ pgId: '5', pgName: 'Other PG' }),
  ];

  const featured = selectFeaturedPropertyRows(rows, '2026-06-01');
  assert.equal(featured.length, 4);
  assert.deepEqual(
    featured.map((r) => r.pgName),
    [
      'CENTRAL - AWESOME PG',
      'CENTRAL - AWESOME PG (Female)',
      'SHANTINAGAR - AWESOME PG',
      'TRIMURTI NAGAR - AWESOME PG',
    ],
  );
});

test('FEATURED_PG_PATTERNS distinguish central male vs female', () => {
  const central = FEATURED_PG_PATTERNS[0]!;
  const female = FEATURED_PG_PATTERNS[1]!;
  assert.equal(central.match('CENTRAL - AWESOME PG'), true);
  assert.equal(central.match('CENTRAL - AWESOME PG (Female)'), false);
  assert.equal(female.match('CENTRAL - AWESOME PG (Female)'), true);
});

test('formatOverviewMetricValue formats money, count, and percent', () => {
  assert.equal(formatOverviewMetricValue('money', 12_345), '₹123');
  assert.equal(formatOverviewMetricValue('count', 1500), '1,500');
  assert.equal(formatOverviewMetricValue('percent', 87), '87%');
});

test('buildOverviewDashboard maps reporting snapshot without transforming values', () => {
  const snapshot = sampleSnapshot();
  const dashboard = buildOverviewDashboard(snapshot);

  assert.equal(dashboard.sections.find((s) => s.id === 'money_today')!.metrics[0]!.value, 10_000);
  assert.equal(
    dashboard.sections.find((s) => s.id === 'mtd')!.metrics.find((m) => m.id === 'late_fees')!.value,
    2_000,
  );
  assert.equal(
    dashboard.sections.find((s) => s.id === 'mtd')!.metrics.find((m) => m.id === 'extra_income')!.value,
    5_000,
  );
  assert.equal(
    dashboard.sections.find((s) => s.id === 'operations')!.metrics.find((m) => m.id === 'electricity_due')!
      .value,
    4,
  );
  assert.equal(
    dashboard.sections.find((s) => s.id === 'occupancy_inventory')!.metrics.find((m) => m.id === 'occupancy')!
      .value,
    75,
  );
  assert.equal(dashboard.propertyPerformance.length, 1);
  assert.equal(
    dashboard.sections.find((s) => s.id === 'invoices_collections')!.metrics.some((m) => m.id === 'rent_outstanding'),
    false,
  );
});
