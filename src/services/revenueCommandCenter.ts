import type {
  BusinessMetricsSummary,
  CollectionBreakdown,
  PgBusinessMetrics,
} from '@/src/db/queries/admin';
import {
  getDepositCollectedByPgForBillingMonth,
  getMtdCollectionByPaymentMode,
  type CollectionByPaymentMode,
} from '@/src/db/queries/admin';
import { getPgFinancialMetrics } from '@/src/services/financialMetricsEngine';
import type { DepositPortfolioMetrics } from '@/src/services/depositLedgerMetrics';
import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import type { PendingPaymentReviewItem } from '@/src/services/paymentProofQueue';
import { getPendingPaymentReviewsForRequest } from '@/src/services/paymentProofQueue';
import {
  isDismissedFromOperationsQueue,
  loadOperationsQueueDismissalIndex,
} from '@/src/services/operationsQueueDismissals';
import {
  computeOutstandingMoneyFromInvoices,
  loadCollectionsSnapshot,
  loadInvoiceOutstandingSnapshot,
  type InvoiceOutstandingSnapshot,
  type OutstandingMoneyFromInvoices,
} from '@/src/services/financialSummaryService';

export type RevenueByPgRow = {
  pgId: string;
  pgName: string;
  occupancyPct: number;
  occupiedBeds: number;
  totalBeds: number;
  rentRevenuePaise: number;
  electricityRevenuePaise: number;
  lateFeePaise: number;
  otherIncomePaise: number;
  /** Deposit cash collected — not operating revenue. */
  depositCollectedPaise: number;
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
    lateFeePaise: number;
    otherIncomePaise: number;
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
  /** @deprecated Unused — revenue loads from financialMetricsEngine directly. */
  summary?: BusinessMetricsSummary;
  /** @deprecated Unused — revenue loads from getPgFinancialMetrics directly. */
  pgMetrics?: PgBusinessMetrics[];
  /** Pre-loaded invoice snapshot — avoids duplicate DB round-trips from Overview. */
  invoiceSnapshot?: InvoiceOutstandingSnapshot;
};

function buildByPgRows(
  pgFinancial: Awaited<ReturnType<typeof getPgFinancialMetrics>>,
  depositByPg: Map<string, number>,
  depositCountsByPg: Map<string, { paid: number; pending: number; requirementMissing: number }>,
): RevenueByPgRow[] {
  return pgFinancial
    .map((row) => {
      const depositCollectedPaise = depositByPg.get(row.pgId) ?? 0;
      const counts = depositCountsByPg.get(row.pgId) ?? {
        paid: 0,
        pending: 0,
        requirementMissing: 0,
      };
      return {
        pgId: row.pgId,
        pgName: row.pgName,
        occupancyPct: row.occupancyPct,
        occupiedBeds: row.occupiedBeds,
        totalBeds: row.totalBeds,
        rentRevenuePaise: row.rentPrincipalPaise,
        electricityRevenuePaise: row.electricityPaise,
        lateFeePaise: row.lateFeePaise,
        otherIncomePaise: row.otherIncomePaise,
        depositCollectedPaise,
        depositPaidCount: counts.paid,
        depositPendingCount: counts.pending,
        depositRequirementMissingCount: counts.requirementMissing,
        totalRevenuePaise: row.operatingRevenuePaise,
      };
    })
    .sort((a, b) => b.totalRevenuePaise - a.totalRevenuePaise);
}

function buildOutstandingFromSsot(
  invoices: OutstandingMoneyFromInvoices,
  pendingDepositPaise: number,
  pendingPayments: PendingPaymentReviewItem[],
): OutstandingMoneySummary {
  const pendingPaymentApprovals = pendingPayments.length;
  const pendingPaymentApprovalsPaise = pendingPayments.reduce((a, p) => a + p.amountPaise, 0);

  return {
    pendingRentInvoices: invoices.pendingRentInvoices,
    pendingRentInvoicesPaise: invoices.pendingRentInvoicesPaise,
    pendingElectricityInvoices: invoices.pendingElectricityInvoices,
    pendingElectricityInvoicesPaise: invoices.pendingElectricityInvoicesPaise,
    pendingDepositPaise,
    pendingPaymentApprovals,
    pendingPaymentApprovalsPaise,
    /** Live unpaid rent + electricity invoices only — no deposits or cached balances. */
    totalOutstandingPaise: invoices.totalOutstandingPaise,
  };
}

/** @internal Exported for financial surface audit tests. */
export function buildOutstandingFromSsotForAudit(
  invoices: OutstandingMoneyFromInvoices,
  pendingPayments: Array<{ amountPaise: number }>,
  pendingDepositPaise = 0,
): Pick<OutstandingMoneySummary, 'totalOutstandingPaise' | 'pendingPaymentApprovalsPaise'> {
  const summary = buildOutstandingFromSsot(
    invoices,
    pendingDepositPaise,
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

  const [collections, depositRows, depositSummaries, rawPaymentReviews, dismissalIndex, invoiceSnapshot, depositPortfolio, collectionsByModeResult, pgFinancial] =
    await Promise.all([
    loadCollectionsSnapshot(billingMonth),
    getDepositCollectedByPgForBillingMonth(billingMonth),
    import('@/src/services/pgDepositCollection').then((m) =>
      m.getAllPgDepositCollectionSummaries(billingMonth),
    ),
    getPendingPaymentReviewsForRequest(input.session),
    loadOperationsQueueDismissalIndex(),
    input.invoiceSnapshot
      ? Promise.resolve(input.invoiceSnapshot)
      : loadInvoiceOutstandingSnapshot(input.session),
    import('@/src/services/depositLedgerMetrics').then((m) =>
      m.getDepositPortfolioMetrics(billingMonth),
    ),
    getMtdCollectionByPaymentMode(billingMonth),
    getPgFinancialMetrics(billingMonth),
  ]);

  const visiblePaymentReviews = rawPaymentReviews.filter(
    (p) =>
      !p.customerId ||
      !isDismissedFromOperationsQueue(dismissalIndex, { customerId: p.customerId }),
  );

  const today = collections.today;

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

  const mtd = collections.mtd;
  const byPg = buildByPgRows(pgFinancial, depositByPg, depositCountsByPg);

  const pendingPayments = visiblePaymentReviews;
  const invoiceOutstanding = computeOutstandingMoneyFromInvoices(invoiceSnapshot);
  const outstanding = buildOutstandingFromSsot(
    invoiceOutstanding,
    depositPortfolio.heldPaise,
    pendingPayments,
  );

  const { getBillingRevenueMetrics } = await import('@/src/services/billingRevenueMetrics');
  const billingMetrics = await getBillingRevenueMetrics(
    billingMonth,
    { rentPaise: mtd.rentPaise, electricityPaise: mtd.electricityPaise },
    {
      rentPaise: invoiceOutstanding.pendingRentInvoicesPaise,
      electricityPaise: invoiceOutstanding.pendingElectricityInvoicesPaise,
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
