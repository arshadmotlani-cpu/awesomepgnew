/**
 * Financial Metrics Engine — single read SSOT for admin revenue surfaces.
 *
 * Revenue is operating income only (rent principal, late fees, electricity, other income).
 * Deposits are cash flow — never mixed into operating revenue totals.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  getBusinessMetricsSummary,
  getPgBusinessMetrics,
  type BusinessMetricsSummary,
  type PgBusinessMetrics,
} from '@/src/db/queries/admin';
import { asPlainNumber } from '@/src/lib/format';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  parseDeductionCategory,
  revenueBucketForCategory,
  type DeductionCategory,
} from '@/src/lib/financial/deductionCategories';
import { getDepositPortfolioMetrics } from '@/src/services/depositLedgerMetrics';

export type OperatingRevenueBreakdown = {
  rentPrincipalPaise: number;
  lateFeePaise: number;
  electricityPaise: number;
  otherIncomePaise: number;
  /** Rent + late + electricity + other — excludes deposits. */
  operatingRevenuePaise: number;
};

export type DepositCashFlow = {
  collectedPaise: number;
  refundedPaise: number;
  /** Rent + elec + deposit collected − deposit refunded (cash). */
  netCashInflowPaise: number;
};

export type FinancialMetrics = {
  billingMonth: string;
  operating: OperatingRevenueBreakdown;
  deposits: DepositCashFlow;
};

export type PgFinancialMetrics = OperatingRevenueBreakdown & {
  pgId: string;
  pgName: string;
  occupancyPct: number;
  occupiedBeds: number;
  totalBeds: number;
};

export type OtherIncomeByCategory = Partial<Record<DeductionCategory, number>>;

/** Pure split — rent invoice total already includes late fees in admin queries. */
export function splitRentAndLateFees(input: {
  incomeRentPaise: number;
  lateFeePaise: number;
}): { rentPrincipalPaise: number; lateFeePaise: number } {
  const lateFeePaise = Math.max(0, input.lateFeePaise);
  const rentPrincipalPaise = Math.max(0, input.incomeRentPaise - lateFeePaise);
  return { rentPrincipalPaise, lateFeePaise };
}

export function computeOperatingRevenue(input: {
  rentPrincipalPaise: number;
  lateFeePaise: number;
  electricityPaise: number;
  otherIncomePaise: number;
}): OperatingRevenueBreakdown {
  const rentPrincipalPaise = Math.max(0, input.rentPrincipalPaise);
  const lateFeePaise = Math.max(0, input.lateFeePaise);
  const electricityPaise = Math.max(0, input.electricityPaise);
  const otherIncomePaise = Math.max(0, input.otherIncomePaise);
  return {
    rentPrincipalPaise,
    lateFeePaise,
    electricityPaise,
    otherIncomePaise,
    operatingRevenuePaise:
      rentPrincipalPaise + lateFeePaise + electricityPaise + otherIncomePaise,
  };
}

export function computeDepositCashFlow(input: {
  rentPrincipalPaise: number;
  lateFeePaise: number;
  electricityPaise: number;
  depositCollectedPaise: number;
  depositRefundedPaise: number;
}): DepositCashFlow {
  const collectedPaise = Math.max(0, input.depositCollectedPaise);
  const refundedPaise = Math.max(0, input.depositRefundedPaise);
  const netCashInflowPaise =
    input.rentPrincipalPaise +
    input.lateFeePaise +
    input.electricityPaise +
    collectedPaise -
    refundedPaise;
  return { collectedPaise, refundedPaise, netCashInflowPaise };
}

function monthBounds(billingMonth: string) {
  return {
    start: sql`${billingMonth}::timestamptz`,
    end: sql`(${billingMonth}::date + interval '1 month')::timestamptz`,
  };
}

/** Other income + electricity deductions from deposit ledger for the billing month. */
export async function getDeductionRevenueForBillingMonth(
  billingMonthInput?: string,
): Promise<{
  otherIncomePaise: number;
  electricityFromDeductionsPaise: number;
  byCategory: OtherIncomeByCategory;
}> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const { start, end } = monthBounds(billingMonth);

  const rows = await db.execute<{
    deduction_category: string | null;
    reason: string;
    total: number;
  }>(sql`
    SELECT
      dl.deduction_category,
      dl.reason,
      coalesce(-sum(dl.amount_paise), 0)::bigint::int AS total
    FROM deposit_ledger dl
    INNER JOIN bookings b ON b.id = dl.booking_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE dl.entry_kind = 'deducted'
      AND dl.created_at >= ${start}
      AND dl.created_at < ${end}
      AND b.is_test = false
      AND c.is_test = false
      AND dl.reason NOT LIKE 'admin collection balance%'
    GROUP BY dl.deduction_category, dl.reason
  `);

  let otherIncomePaise = 0;
  let electricityFromDeductionsPaise = 0;
  const byCategory: OtherIncomeByCategory = {};

  for (const row of rows) {
    const amount = asPlainNumber(row.total);
    if (amount <= 0) continue;
    const category = parseDeductionCategory({
      deductionCategory: row.deduction_category,
      reason: row.reason,
    });
    byCategory[category] = (byCategory[category] ?? 0) + amount;
    if (revenueBucketForCategory(category) === 'electricity') {
      electricityFromDeductionsPaise += amount;
    } else {
      otherIncomePaise += amount;
    }
  }

  return { otherIncomePaise, electricityFromDeductionsPaise, byCategory };
}

export function metricsFromBusinessSummary(
  summary: BusinessMetricsSummary,
  depositCollectedPaise: number,
  otherIncomePaise: number,
): FinancialMetrics {
  const { rentPrincipalPaise, lateFeePaise } = splitRentAndLateFees({
    incomeRentPaise: summary.incomeRentPaise,
    lateFeePaise: summary.lateFeePaise,
  });
  const operating = computeOperatingRevenue({
    rentPrincipalPaise,
    lateFeePaise,
    electricityPaise: summary.incomeElectricityPaise,
    otherIncomePaise,
  });
  const deposits = computeDepositCashFlow({
    rentPrincipalPaise,
    lateFeePaise,
    electricityPaise: summary.incomeElectricityPaise,
    depositCollectedPaise,
    depositRefundedPaise: summary.depositRefundsPaise,
  });
  return {
    billingMonth: summary.billingMonth,
    operating,
    deposits,
  };
}

export function pgMetricsFromRow(row: PgBusinessMetrics, otherIncomePaise = 0): PgFinancialMetrics {
  const { rentPrincipalPaise, lateFeePaise } = splitRentAndLateFees({
    incomeRentPaise: row.incomeRentPaise,
    lateFeePaise: row.lateFeePaise,
  });
  const operating = computeOperatingRevenue({
    rentPrincipalPaise,
    lateFeePaise,
    electricityPaise: row.incomeElectricityPaise,
    otherIncomePaise,
  });
  return {
    pgId: row.pgId,
    pgName: row.pgName,
    occupancyPct: row.occupancyPct,
    occupiedBeds: row.occupiedBeds,
    totalBeds: row.totalBeds,
    ...operating,
  };
}

/** Portfolio-level financial metrics for a billing month. */
export async function getFinancialMetrics(
  billingMonthInput?: string,
): Promise<FinancialMetrics> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const [summaryResult, depositPortfolio, deductionRevenue] = await Promise.all([
    getBusinessMetricsSummary(billingMonth),
    getDepositPortfolioMetrics(billingMonth),
    getDeductionRevenueForBillingMonth(billingMonth),
  ]);

  const summary: BusinessMetricsSummary = summaryResult.ok
    ? summaryResult.data
    : {
        billingMonth,
        totalBeds: 0,
        occupiedBeds: 0,
        availableBeds: 0,
        occupancyPct: 0,
        incomeRentQrPaise: 0,
        incomeRentInvoicePaise: 0,
        incomeRentPaise: 0,
        incomeElectricityQrPaise: 0,
        incomeElectricityInvoicePaise: 0,
        incomeElectricityPaise: 0,
        incomeTotalPaise: 0,
        expectedMonthlyRentPaise: 0,
        lateFeePaise: 0,
        vacatingDeductionPaise: 0,
        otherDeductionPaise: 0,
        depositRefundsCount: 0,
        depositRefundsPaise: 0,
        extraIncomePaise: 0,
      };

  return metricsFromBusinessSummary(
    summary,
    depositPortfolio.collectedMtdPaise,
    deductionRevenue.otherIncomePaise,
  );
}

/** Per-PG operating revenue — other income is portfolio-level only (not split by PG yet). */
export async function getPgFinancialMetrics(
  billingMonthInput?: string,
): Promise<PgFinancialMetrics[]> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const result = await getPgBusinessMetrics(billingMonth);
  if (!result.ok) return [];
  return result.data.map((row) => pgMetricsFromRow(row, 0));
}
