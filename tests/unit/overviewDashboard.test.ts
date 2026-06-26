import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOverviewDashboard,
  FEATURED_PG_PATTERNS,
  formatOverviewMetricValue,
  selectFeaturedPropertyRows,
} from '@/src/services/overviewDashboard';
import type { OverviewContext } from '@/src/services/overviewData';
import type { RevenueByPgRow } from '@/src/services/revenueCommandCenter';

function samplePgRow(overrides: Partial<RevenueByPgRow> & { pgId: string; pgName: string }): RevenueByPgRow {
  return {
    occupancyPct: 80,
    occupiedBeds: 8,
    totalBeds: 10,
    rentRevenuePaise: 100_000,
    electricityRevenuePaise: 20_000,
    depositRevenuePaise: 50_000,
    lateFeePaise: 0,
    depositPaidCount: 1,
    depositPendingCount: 0,
    depositRequirementMissingCount: 0,
    totalRevenuePaise: 170_000,
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
  assert.equal(featured[0]!.totalRevenuePaise, 170_000);
  assert.match(featured[0]!.href, /\/admin\/revenue\/pg\/1\?month=2026-06-01/);
});

test('selectFeaturedPropertyRows falls back to top PG rows when no pattern match', () => {
  const rows = [
    samplePgRow({ pgId: 'a', pgName: 'Alpha PG' }),
    samplePgRow({ pgId: 'b', pgName: 'Beta PG' }),
  ];
  const featured = selectFeaturedPropertyRows(rows, '2026-06-01');
  assert.equal(featured.length, 2);
  assert.equal(featured[0]!.pgName, 'Alpha PG');
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

test('buildOverviewDashboard maps context into spec sections', () => {
  const ctx = {
    billingMonth: '2026-06-01',
    monthLabel: 'June 2026',
    summary: {
      incomeRentPaise: 500_000,
      incomeElectricityPaise: 80_000,
      extraIncomePaise: 5_000,
      lateFeePaise: 2_000,
      occupancyPct: 75,
      occupiedBeds: 30,
      totalBeds: 40,
      availableBeds: 10,
    },
    revenue: {
      today: { totalPaise: 10_000, rentPaise: 6_000, electricityPaise: 2_000, depositPaise: 2_000 },
      mtd: { totalPaise: 600_000, rentPaise: 500_000, electricityPaise: 80_000, depositPaise: 20_000 },
      outstanding: {
        pendingRentInvoices: 3,
        pendingRentInvoicesPaise: 15_000,
        pendingElectricityInvoices: 2,
        pendingElectricityInvoicesPaise: 4_000,
        pendingPaymentApprovals: 1,
        pendingPaymentApprovalsPaise: 3_000,
        totalOutstandingPaise: 19_000,
      },
      byPg: [samplePgRow({ pgId: '1', pgName: 'SHANTINAGAR - AWESOME PG' })],
    },
    dashboard: {
      totalPgs: 4,
      totalFloors: 8,
      totalRooms: 20,
      totalBeds: 40,
      blockedBeds: 1,
      maintenanceBeds: 2,
    },
    rentStats: {
      overdueCount: 2,
      paidCount: 10,
      collectedPaise: 500_000,
      outstandingPaise: 15_000,
    },
    overviewKpis: {
      activeTenants: 28,
      pendingKyc: 3,
      pendingPayments: 4,
    },
    visitors: {
      allTime: 1000,
      uniqueAllTime: 800,
      today: 12,
      uniqueToday: 10,
      week: 90,
      month: 300,
    },
    operations: {
      pendingPayments: { count: 2, items: [] },
      pendingKyc: { count: 3, items: [] },
      leavingSoon: { count: 1, items: [] },
      bedsReleasingSoon: { count: 2, items: [] },
      upcomingReservations: { count: 5, items: [] },
      refundsPending: { count: 1, items: [] },
      electricityPending: { count: 4, items: [] },
    },
    pgCount: 4,
    vacatingAlertsCount: 1,
  } as unknown as OverviewContext;

  const dashboard = buildOverviewDashboard(ctx);

  assert.equal(dashboard.sections.length, 10);
  assert.equal(dashboard.sections[0]!.title, 'MONEY TODAY');
  assert.equal(dashboard.sections[0]!.metrics[0]!.value, 10_000);
  assert.equal(dashboard.sections[1]!.metrics.find((m) => m.id === 'late_fees')!.value, 2_000);
  assert.equal(
    dashboard.sections.find((s) => s.id === 'invoices_collections')!.metrics.find((m) => m.id === 'overdue_rent')!
      .value,
    2,
  );
  assert.equal(dashboard.propertyPerformance.length, 1);
  assert.equal(dashboard.operationsAlerts.length, 4);
});
