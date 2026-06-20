/**
 * Single metric source for dashboard revenue — avoids duplicate fetches/formulas.
 */

import {
  getBusinessMetricsSummary,
  getDepositCollectedByPgForBillingMonth,
} from '@/src/db/queries/admin';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';

export type MonthlyRevenueMetrics = {
  billingMonth: string;
  rentPaise: number;
  electricityPaise: number;
  rentAndElectricityPaise: number;
  depositPaise: number;
  depositRefundedPaise: number;
  netInflowPaise: number;
  totalPaise: number;
};

export async function getMonthlyRevenuePaise(
  billingMonthInput?: string,
): Promise<MonthlyRevenueMetrics> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const [monthSummary, depositByPg, depositMetrics] = await Promise.all([
    getBusinessMetricsSummary(billingMonth),
    getDepositCollectedByPgForBillingMonth(billingMonth),
    import('@/src/services/depositLedgerMetrics').then((m) =>
      m.getDepositPortfolioMetrics(billingMonth),
    ),
  ]);

  const rentPaise = monthSummary.ok ? monthSummary.data.incomeRentPaise : 0;
  const electricityPaise = monthSummary.ok ? monthSummary.data.incomeElectricityPaise : 0;
  const rentAndElectricityPaise = monthSummary.ok ? monthSummary.data.incomeTotalPaise : 0;
  const depositPaise = depositByPg.ok
    ? depositByPg.data.reduce((a, r) => a + r.collectedPaise, 0)
    : depositMetrics.collectedMtdPaise;
  const depositRefundedPaise = monthSummary.ok
    ? monthSummary.data.depositRefundsPaise
    : depositMetrics.refundedMtdPaise;
  const netInflowPaise = rentPaise + depositPaise - depositRefundedPaise;

  return {
    billingMonth,
    rentPaise,
    electricityPaise,
    rentAndElectricityPaise,
    depositPaise,
    depositRefundedPaise,
    netInflowPaise,
    totalPaise: rentAndElectricityPaise + depositPaise,
  };
}
