import type {
  BusinessMetricsSummary,
  CollectionBreakdown,
  PgBusinessMetrics,
  RentStats,
} from '@/src/db/queries/admin';
import {
  getDailyCollectionTotals,
  getDepositCollectedByPgForBillingMonth,
  getRentStats,
} from '@/src/db/queries/admin';
import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import type { PendingPaymentReviewItem } from '@/src/services/paymentProofQueue';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';

export type RevenueByPgRow = {
  pgId: string;
  pgName: string;
  occupancyPct: number;
  occupiedBeds: number;
  totalBeds: number;
  rentRevenuePaise: number;
  electricityRevenuePaise: number;
  depositRevenuePaise: number;
  totalRevenuePaise: number;
};

export type OutstandingMoneySummary = {
  pendingRentInvoices: number;
  pendingRentInvoicesPaise: number;
  pendingElectricityInvoices: number;
  pendingElectricityInvoicesPaise: number;
  pendingPaymentApprovals: number;
  pendingPaymentApprovalsPaise: number;
  totalOutstandingPaise: number;
};

export type RevenueCommandCenterData = {
  billingMonth: string;
  today: CollectionBreakdown;
  mtd: CollectionBreakdown;
  byPg: RevenueByPgRow[];
  outstanding: OutstandingMoneySummary;
};

export type RevenueCommandCenterInput = {
  billingMonth?: string;
  session: AdminSession;
  summary: BusinessMetricsSummary;
  pgMetrics: PgBusinessMetrics[];
  electricityPending?: {
    count: number;
    items: Array<{ amountDuePaise: number }>;
  };
};

function buildMtdBreakdown(
  summary: BusinessMetricsSummary,
  depositByPg: Map<string, number>,
): CollectionBreakdown {
  const depositPaise = [...depositByPg.values()].reduce((a, v) => a + v, 0);
  const rentPaise = summary.incomeRentPaise;
  const electricityPaise = summary.incomeElectricityPaise;
  return {
    rentPaise,
    electricityPaise,
    depositPaise,
    totalPaise: rentPaise + electricityPaise + depositPaise,
  };
}

function buildByPgRows(
  pgMetrics: PgBusinessMetrics[],
  depositByPg: Map<string, number>,
): RevenueByPgRow[] {
  return pgMetrics
    .map((row) => {
      const depositRevenuePaise = depositByPg.get(row.pgId) ?? 0;
      const rentRevenuePaise = row.incomeRentPaise;
      const electricityRevenuePaise = row.incomeElectricityPaise;
      return {
        pgId: row.pgId,
        pgName: row.pgName,
        occupancyPct: row.occupancyPct,
        occupiedBeds: row.occupiedBeds,
        totalBeds: row.totalBeds,
        rentRevenuePaise,
        electricityRevenuePaise,
        depositRevenuePaise,
        totalRevenuePaise:
          rentRevenuePaise + electricityRevenuePaise + depositRevenuePaise,
      };
    })
    .sort((a, b) => b.totalRevenuePaise - a.totalRevenuePaise);
}

function buildOutstanding(
  rentStats: RentStats,
  pendingPayments: PendingPaymentReviewItem[],
  electricityPending?: RevenueCommandCenterInput['electricityPending'],
): OutstandingMoneySummary {
  const pendingRentInvoices = rentStats.pendingCount + rentStats.overdueCount;
  const pendingRentInvoicesPaise = rentStats.outstandingPaise;
  const pendingElectricityInvoices = electricityPending?.count ?? 0;
  const pendingElectricityInvoicesPaise =
    electricityPending?.items.reduce((a, i) => a + i.amountDuePaise, 0) ?? 0;
  const pendingPaymentApprovals = pendingPayments.length;
  const pendingPaymentApprovalsPaise = pendingPayments.reduce(
    (a, p) => a + p.amountPaise,
    0,
  );

  return {
    pendingRentInvoices,
    pendingRentInvoicesPaise,
    pendingElectricityInvoices,
    pendingElectricityInvoicesPaise,
    pendingPaymentApprovals,
    pendingPaymentApprovalsPaise,
    totalOutstandingPaise:
      pendingRentInvoicesPaise +
      pendingElectricityInvoicesPaise +
      pendingPaymentApprovalsPaise,
  };
}

/** Composes overview revenue data from existing admin collection queries (no duplicate SQL). */
export async function getRevenueCommandCenterData(
  input: RevenueCommandCenterInput,
): Promise<RevenueCommandCenterData> {
  const billingMonth = resolveBillingMonth(input.billingMonth);

  const [todayResult, depositRows, rentStatsResult, pendingPayments] = await Promise.all([
    getDailyCollectionTotals(),
    getDepositCollectedByPgForBillingMonth(billingMonth),
    getRentStats(),
    listPendingPaymentReviews(input.session),
  ]);

  const today: CollectionBreakdown = todayResult.ok
    ? todayResult.data
    : { rentPaise: 0, electricityPaise: 0, depositPaise: 0, totalPaise: 0 };

  const depositByPg = new Map<string, number>();
  if (depositRows.ok) {
    for (const row of depositRows.data) {
      depositByPg.set(row.pgId, row.collectedPaise);
    }
  }

  const mtd = buildMtdBreakdown(input.summary, depositByPg);
  const byPg = buildByPgRows(input.pgMetrics, depositByPg);

  const rentStats: RentStats = rentStatsResult.ok
    ? rentStatsResult.data
    : {
        pendingCount: 0,
        overdueCount: 0,
        paidCount: 0,
        cancelledCount: 0,
        totalRentPaise: 0,
        collectedPaise: 0,
        outstandingPaise: 0,
      };

  const outstanding = buildOutstanding(
    rentStats,
    pendingPayments,
    input.electricityPending,
  );

  return {
    billingMonth,
    today,
    mtd,
    byPg,
    outstanding,
  };
}
