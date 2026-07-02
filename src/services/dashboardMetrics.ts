/**
 * Single metric source for dashboard revenue — delegates to FinancialMetricsEngine.
 */

import { getFinancialMetrics } from '@/src/services/financialMetricsEngine';

export type MonthlyRevenueMetrics = {
  billingMonth: string;
  rentPaise: number;
  electricityPaise: number;
  lateFeePaise: number;
  otherIncomePaise: number;
  rentAndElectricityPaise: number;
  depositPaise: number;
  depositRefundedPaise: number;
  netInflowPaise: number;
  /** Operating revenue only — excludes deposits. */
  totalPaise: number;
};

export async function getMonthlyRevenuePaise(
  billingMonthInput?: string,
): Promise<MonthlyRevenueMetrics> {
  const metrics = await getFinancialMetrics(billingMonthInput);
  return {
    billingMonth: metrics.billingMonth,
    rentPaise: metrics.operating.rentPrincipalPaise,
    electricityPaise: metrics.operating.electricityPaise,
    lateFeePaise: metrics.operating.lateFeePaise,
    otherIncomePaise: metrics.operating.otherIncomePaise,
    rentAndElectricityPaise:
      metrics.operating.rentPrincipalPaise +
      metrics.operating.lateFeePaise +
      metrics.operating.electricityPaise,
    depositPaise: metrics.deposits.collectedPaise,
    depositRefundedPaise: metrics.deposits.refundedPaise,
    netInflowPaise: metrics.deposits.netCashInflowPaise,
    totalPaise: metrics.operating.operatingRevenuePaise,
  };
}
