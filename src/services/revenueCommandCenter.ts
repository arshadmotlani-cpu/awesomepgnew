import type {
  BusinessMetricsSummary,
  CollectionBreakdown,
  PgBusinessMetrics,
} from '@/src/db/queries/admin';
import {
  getDailyCollectionTotals,
  getDepositCollectedByPgForBillingMonth,
} from '@/src/db/queries/admin';
import { getMonthlyRevenuePaise } from '@/src/services/dashboardMetrics';
import type { DepositPortfolioMetrics } from '@/src/services/depositLedgerMetrics';
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
  pendingDepositPaise: number;
  pendingPaymentApprovals: number;
  pendingPaymentApprovalsPaise: number;
  totalOutstandingPaise: number;
};

export type RevenueCommandCenterData = {
  billingMonth: string;
  today: CollectionBreakdown;
  mtd: CollectionBreakdown & {
    depositRefundedPaise: number;
    netInflowPaise: number;
  };
  depositPortfolio: DepositPortfolioMetrics;
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

function buildOutstandingFromSsot(
  portfolio: Awaited<ReturnType<typeof import('@/src/services/residentFinancialEngine').getPortfolioFinancialTotals>>,
  pendingPayments: PendingPaymentReviewItem[],
): OutstandingMoneySummary {
  const pendingPaymentApprovals = pendingPayments.length;
  const pendingPaymentApprovalsPaise = pendingPayments.reduce((a, p) => a + p.amountPaise, 0);

  return {
    pendingRentInvoices: portfolio.pendingRentInvoiceCount,
    pendingRentInvoicesPaise: portfolio.rent.outstandingPaise,
    pendingElectricityInvoices: portfolio.pendingElectricityInvoiceCount,
    pendingElectricityInvoicesPaise: portfolio.electricity.outstandingPaise,
    pendingDepositPaise: portfolio.deposit.outstandingPaise,
    pendingPaymentApprovals,
    pendingPaymentApprovalsPaise,
    totalOutstandingPaise:
      portfolio.totals.outstandingPaise + pendingPaymentApprovalsPaise,
  };
}

/** Composes overview revenue data from existing admin collection queries (no duplicate SQL). */
export async function getRevenueCommandCenterData(
  input: RevenueCommandCenterInput,
): Promise<RevenueCommandCenterData> {
  const billingMonth = resolveBillingMonth(input.billingMonth);

  const [todayResult, depositRows, pendingPayments, portfolioTotals, depositPortfolio] =
    await Promise.all([
    getDailyCollectionTotals(),
    getDepositCollectedByPgForBillingMonth(billingMonth),
    listPendingPaymentReviews(input.session),
    import('@/src/services/residentFinancialEngine').then((m) =>
      m.getPortfolioFinancialTotals(input.session),
    ),
    import('@/src/services/depositLedgerMetrics').then((m) =>
      m.getDepositPortfolioMetrics(billingMonth),
    ),
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

  const mtdMetrics = await getMonthlyRevenuePaise(billingMonth);
  const mtd = {
    rentPaise: mtdMetrics.rentPaise,
    electricityPaise: mtdMetrics.electricityPaise,
    depositPaise: mtdMetrics.depositPaise,
    totalPaise: mtdMetrics.totalPaise,
    depositRefundedPaise: mtdMetrics.depositRefundedPaise,
    netInflowPaise: mtdMetrics.netInflowPaise,
  };
  const byPg = buildByPgRows(input.pgMetrics, depositByPg);

  const outstanding = buildOutstandingFromSsot(portfolioTotals, pendingPayments);

  return {
    billingMonth,
    today,
    mtd,
    depositPortfolio,
    byPg,
    outstanding,
  };
}
