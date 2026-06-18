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
  totalPaise: number;
};

export async function getMonthlyRevenuePaise(
  billingMonthInput?: string,
): Promise<MonthlyRevenueMetrics> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const [monthSummary, depositByPg] = await Promise.all([
    getBusinessMetricsSummary(billingMonth),
    getDepositCollectedByPgForBillingMonth(billingMonth),
  ]);

  const rentPaise = monthSummary.ok ? monthSummary.data.incomeRentPaise : 0;
  const electricityPaise = monthSummary.ok ? monthSummary.data.incomeElectricityPaise : 0;
  const rentAndElectricityPaise = monthSummary.ok ? monthSummary.data.incomeTotalPaise : 0;
  const depositPaise = depositByPg.ok
    ? depositByPg.data.reduce((a, r) => a + r.collectedPaise, 0)
    : 0;

  return {
    billingMonth,
    rentPaise,
    electricityPaise,
    rentAndElectricityPaise,
    depositPaise,
    totalPaise: rentAndElectricityPaise + depositPaise,
  };
}
