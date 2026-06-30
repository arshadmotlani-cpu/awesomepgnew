import type {
  BusinessMetricsSummary,
  CollectionBreakdown,
  PgBusinessMetrics,
} from '@/src/db/queries/admin';
import {
  getDailyCollectionTotals,
  getDepositCollectedByPgForBillingMonth,
  getMtdCollectionByPaymentMode,
  type CollectionByPaymentMode,
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
  lateFeePaise: number;
  depositPaidCount: number;
  depositPendingCount: number;
  depositRequirementMissingCount: number;
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
  collectionsByMode: CollectionByPaymentMode;
  depositPortfolio: DepositPortfolioMetrics;
  byPg: RevenueByPgRow[];
  outstanding: OutstandingMoneySummary;
  billingMetrics: import('@/src/services/billingRevenueMetrics').BillingRevenueMetrics;
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
  depositCountsByPg: Map<string, { paid: number; pending: number; requirementMissing: number }>,
): RevenueByPgRow[] {
  return pgMetrics
    .map((row) => {
      const depositRevenuePaise = depositByPg.get(row.pgId) ?? 0;
      const counts = depositCountsByPg.get(row.pgId) ?? {
        paid: 0,
        pending: 0,
        requirementMissing: 0,
      };
      const rentRevenuePaise = row.incomeRentPaise;
      const electricityRevenuePaise = row.incomeElectricityPaise;
      const lateFeePaise = row.lateFeePaise;
      return {
        pgId: row.pgId,
        pgName: row.pgName,
        occupancyPct: row.occupancyPct,
        occupiedBeds: row.occupiedBeds,
        totalBeds: row.totalBeds,
        rentRevenuePaise,
        electricityRevenuePaise,
        depositRevenuePaise,
        lateFeePaise,
        depositPaidCount: counts.paid,
        depositPendingCount: counts.pending,
        depositRequirementMissingCount: counts.requirementMissing,
        totalRevenuePaise:
          rentRevenuePaise + electricityRevenuePaise + depositRevenuePaise + lateFeePaise,
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
    /** SSOT: invoice outstanding only — proofs awaiting review are already in outstanding. */
    totalOutstandingPaise: portfolio.totals.outstandingPaise,
  };
}

/** @internal Exported for financial surface audit tests. */
export function buildOutstandingFromSsotForAudit(
  portfolio: {
    pendingRentInvoiceCount: number;
    pendingElectricityInvoiceCount: number;
    rent: { outstandingPaise: number };
    electricity: { outstandingPaise: number };
    deposit: { outstandingPaise: number };
    totals: { outstandingPaise: number };
  },
  pendingPayments: Array<{ amountPaise: number }>,
): Pick<OutstandingMoneySummary, 'totalOutstandingPaise' | 'pendingPaymentApprovalsPaise'> {
  const summary = buildOutstandingFromSsot(
    portfolio as Awaited<ReturnType<typeof import('@/src/services/residentFinancialEngine').getPortfolioFinancialTotals>>,
    pendingPayments as PendingPaymentReviewItem[],
  );
  return {
    totalOutstandingPaise: summary.totalOutstandingPaise,
    pendingPaymentApprovalsPaise: summary.pendingPaymentApprovalsPaise,
  };
}

/** Composes overview revenue data from existing admin collection queries (no duplicate SQL). */
export async function getRevenueCommandCenterData(
  input: RevenueCommandCenterInput,
): Promise<RevenueCommandCenterData> {
  const billingMonth = resolveBillingMonth(input.billingMonth);

  const [todayResult, depositRows, depositSummaries, pendingPayments, portfolioTotals, depositPortfolio, collectionsByModeResult] =
    await Promise.all([
    getDailyCollectionTotals(),
    getDepositCollectedByPgForBillingMonth(billingMonth),
    import('@/src/services/pgDepositCollection').then((m) =>
      m.getAllPgDepositCollectionSummaries(billingMonth),
    ),
    listPendingPaymentReviews(input.session),
    import('@/src/services/residentFinancialEngine').then((m) =>
      m.getPortfolioFinancialTotals(input.session),
    ),
    import('@/src/services/depositLedgerMetrics').then((m) =>
      m.getDepositPortfolioMetrics(billingMonth),
    ),
    getMtdCollectionByPaymentMode(billingMonth),
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

  const depositCountsByPg = new Map<
    string,
    { paid: number; pending: number; requirementMissing: number }
  >();
  for (const row of depositSummaries) {
    depositCountsByPg.set(row.pgId, {
      paid: row.depositPaidCount,
      pending: row.depositPendingCount,
      requirementMissing: row.depositRequirementMissingCount,
    });
    if (!depositByPg.has(row.pgId)) {
      depositByPg.set(row.pgId, row.depositCollectedMtdPaise);
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
  const byPg = buildByPgRows(input.pgMetrics, depositByPg, depositCountsByPg);

  const outstanding = buildOutstandingFromSsot(portfolioTotals, pendingPayments);

  const { getBillingRevenueMetrics } = await import('@/src/services/billingRevenueMetrics');
  const billingMetrics = await getBillingRevenueMetrics(
    billingMonth,
    { rentPaise: mtd.rentPaise, electricityPaise: mtd.electricityPaise },
    {
      rentPaise: portfolioTotals.rent.outstandingPaise,
      electricityPaise: portfolioTotals.electricity.outstandingPaise,
    },
  );

  const collectionsByMode: CollectionByPaymentMode = collectionsByModeResult.ok
    ? collectionsByModeResult.data
    : { upiPaise: 0, cashPaise: 0, bankTransferPaise: 0, otherPaise: 0, totalPaise: 0 };

  return {
    billingMonth,
    today,
    mtd,
    collectionsByMode,
    depositPortfolio,
    byPg,
    outstanding,
    billingMetrics,
  };
}
