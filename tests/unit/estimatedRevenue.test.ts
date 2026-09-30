import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  aggregateEstimatedRevenueByPg,
  buildEstimatedRevenuePgRow,
  computeEstimatedYearlyRevenuePaise,
  isBedStatusRentableForEstimatedRevenue,
  sumEstimatedMonthlyRevenuePaise,
  ESTIMATED_REVENUE_MONTHS_PER_YEAR,
} from '@/src/lib/inventory/estimatedRevenue';
import { buildOwnerDashboard } from '@/src/services/ownerDashboard';
import { buildOverviewDashboard } from '@/src/services/overviewDashboard';
import type { OverviewReportingSnapshot } from '@/src/services/overviewReportingService';

const RATE_5K = 500_000;

describe('estimated revenue formula', () => {
  test('1 — 20 rentable beds × ₹5,000 = ₹1,00,000/month', () => {
    const monthly = sumEstimatedMonthlyRevenuePaise(Array(20).fill(RATE_5K));
    assert.equal(monthly, 10_000_000);
  });

  test('2 — yearly = monthly × 12', () => {
    assert.equal(ESTIMATED_REVENUE_MONTHS_PER_YEAR, 12);
    assert.equal(computeEstimatedYearlyRevenuePaise(10_000_000), 120_000_000);
  });

  test('3–5 — occupied, vacant rentable, and maintenance status rules', () => {
    assert.equal(isBedStatusRentableForEstimatedRevenue('available'), true);
    assert.equal(isBedStatusRentableForEstimatedRevenue('maintenance'), false);
    assert.equal(isBedStatusRentableForEstimatedRevenue('blocked'), false);

    const twentyRentable = buildEstimatedRevenuePgRow({
      pgId: 'pg-1',
      pgName: 'A',
      monthlyRatePaisePerRentableBed: Array(20).fill(RATE_5K),
      counts: {
        rentableBeds: 20,
        occupiedBeds: 16,
        vacantRentableBeds: 4,
        maintenanceBeds: 0,
        blockedBeds: 0,
      },
    });
    assert.equal(twentyRentable.monthlyRevenuePaise, 10_000_000);

    const withMaintenance = buildEstimatedRevenuePgRow({
      pgId: 'pg-1',
      pgName: 'A',
      monthlyRatePaisePerRentableBed: Array(18).fill(RATE_5K),
      counts: {
        rentableBeds: 18,
        occupiedBeds: 16,
        vacantRentableBeds: 2,
        maintenanceBeds: 2,
        blockedBeds: 0,
      },
    });
    assert.equal(withMaintenance.monthlyRevenuePaise, 9_000_000);
    assert.equal(withMaintenance.yearlyRevenuePaise, 108_000_000);
  });

  test('6 — archived beds excluded from rentable inputs (simulated by omitting beds)', () => {
    const before = sumEstimatedMonthlyRevenuePaise(Array(20).fill(RATE_5K));
    const afterArchive = sumEstimatedMonthlyRevenuePaise(Array(19).fill(RATE_5K));
    assert.equal(before - afterArchive, RATE_5K);
  });

  test('7 — different bed prices summed individually', () => {
    const monthly = sumEstimatedMonthlyRevenuePaise([500_000, 600_000, 450_000]);
    assert.equal(monthly, 1_550_000);
  });

  test('8–9 — add/remove rentable bed changes estimate', () => {
    const base = sumEstimatedMonthlyRevenuePaise([RATE_5K, RATE_5K]);
    const added = sumEstimatedMonthlyRevenuePaise([RATE_5K, RATE_5K, RATE_5K]);
    assert.equal(added - base, RATE_5K);
  });

  test('10 — price change updates estimate', () => {
    const before = sumEstimatedMonthlyRevenuePaise([RATE_5K]);
    const after = sumEstimatedMonthlyRevenuePaise([550_000]);
    assert.equal(after - before, 50_000);
  });

  test('11 — portfolio estimate equals sum of PG estimates', () => {
    const byPg = [
      buildEstimatedRevenuePgRow({
        pgId: 'a',
        pgName: 'A',
        monthlyRatePaisePerRentableBed: [RATE_5K, RATE_5K],
        counts: {
          rentableBeds: 2,
          occupiedBeds: 1,
          vacantRentableBeds: 1,
          maintenanceBeds: 0,
          blockedBeds: 0,
        },
      }),
      buildEstimatedRevenuePgRow({
        pgId: 'b',
        pgName: 'B',
        monthlyRatePaisePerRentableBed: [600_000],
        counts: {
          rentableBeds: 1,
          occupiedBeds: 0,
          vacantRentableBeds: 1,
          maintenanceBeds: 0,
          blockedBeds: 0,
        },
      }),
    ];
    const portfolio = aggregateEstimatedRevenueByPg(byPg);
    assert.equal(portfolio.monthlyRevenuePaise, 1_600_000);
    assert.equal(portfolio.rentableBeds, 3);
  });

  test('12 — estimate independent of occupancy percentage', () => {
    const highOcc = buildEstimatedRevenuePgRow({
      pgId: 'pg-1',
      pgName: 'A',
      monthlyRatePaisePerRentableBed: Array(20).fill(RATE_5K),
      counts: {
        rentableBeds: 20,
        occupiedBeds: 19,
        vacantRentableBeds: 1,
        maintenanceBeds: 0,
        blockedBeds: 0,
      },
    });
    const lowOcc = buildEstimatedRevenuePgRow({
      pgId: 'pg-1',
      pgName: 'A',
      monthlyRatePaisePerRentableBed: Array(20).fill(RATE_5K),
      counts: {
        rentableBeds: 20,
        occupiedBeds: 4,
        vacantRentableBeds: 16,
        maintenanceBeds: 0,
        blockedBeds: 0,
      },
    });
    assert.equal(highOcc.monthlyRevenuePaise, lowOcc.monthlyRevenuePaise);
  });

  test('13–14 — owner dashboard maps estimate without altering MTD revenue', () => {
    const snapshot: OverviewReportingSnapshot = {
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
        pendingRentInvoices: 0,
        pendingRentInvoicesPaise: 0,
        pendingElectricityInvoices: 0,
        pendingElectricityInvoicesPaise: 0,
        totalOutstandingPaise: 0,
      },
      rentStats: null,
      revenue: {
        billingMonth: '2026-06-01',
        today: { totalPaise: 0, rentPaise: 0, electricityPaise: 0, depositPaise: 0 },
        mtd: {
          totalPaise: 999_999,
          rentPaise: 999_999,
          electricityPaise: 0,
          depositPaise: 0,
          lateFeePaise: 0,
          otherIncomePaise: 0,
          depositRefundedPaise: 0,
          netInflowPaise: 999_999,
        },
        collectionsByMode: {
          upiPaise: 0,
          cashPaise: 0,
          bankTransferPaise: 0,
          otherPaise: 0,
          totalPaise: 0,
        },
        depositPortfolio: {
          billingMonth: '2026-06-01',
          collectedAllTimePaise: 0,
          collectedMtdPaise: 0,
          heldPaise: 0,
          refundedAllTimePaise: 0,
          refundedMtdPaise: 0,
          residentDeductionsPaise: 0,
        },
        byPg: [],
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
          billingMonth: '2026-06-01',
          collectedMtdPaise: 999_999,
          outstandingPaise: 0,
          collectionRatePct: 100,
        },
      },
      billingCenter: { reconciliation: null, reconciliationError: null, totalOutstandingPaise: 0, overdueCount: 0, cards: [] } as never,
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
      moveOutPipeline: { counts: { bedsReleasing30Days: 0 }, stages: [] } as never,
      pgCount: 0,
      estimatedRevenue: {
        asOfDate: '2026-06-01',
        monthlyRevenuePaise: 10_000_000,
        yearlyRevenuePaise: 120_000_000,
        rentableBeds: 20,
        occupiedBeds: 16,
        vacantRentableBeds: 4,
        maintenanceBeds: 2,
        blockedBeds: 0,
        byPg: [],
      },
    };

    const owner = buildOwnerDashboard(snapshot);
    const mtd = owner.kpis.find((k) => k.id === 'operating_revenue_mtd');
    assert.equal(mtd?.value, 999_999);
    const est = owner.kpis.find((k) => k.id === 'estimated_revenue_monthly');
    assert.equal(est?.value, 10_000_000);

    const legacy = buildOverviewDashboard(snapshot);
    const legacyMtd = legacy.sections
      .flatMap((s) => s.metrics)
      .find((m) => m.id === 'mtd_total');
    assert.equal(legacyMtd?.value, 999_999);
  });
});
