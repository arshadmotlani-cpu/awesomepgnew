/**
 * Owner-level PG financial summary for Owner OS integration.
 * Does not duplicate resident billing math — consumes getFinancialMetrics only.
 */
import { getFinancialMetrics } from '@/src/services/financialMetricsEngine';

function resolveBillingMonth(month?: string): string {
  if (month && /^\d{4}-\d{2}$/.test(month)) return month;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(billingMonth: string): { start: string; end: string } {
  const [year, mon] = billingMonth.split('-').map(Number);
  const start = `${billingMonth}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const end = `${billingMonth}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export type OwnerPgFinancialSummary = {
  periodStart: string;
  periodEnd: string;
  billingMonth: string;
  revenuePaise: number;
  expensePaise: number;
  profitPaise: number;
  revenueBreakdown: {
    rentPrincipalPaise: number;
    lateFeePaise: number;
    electricityPaise: number;
    otherIncomePaise: number;
  };
};

export async function getOwnerFinancialSummary(opts?: {
  month?: string;
  pgId?: string;
}): Promise<OwnerPgFinancialSummary> {
  const billingMonth = resolveBillingMonth(opts?.month);
  const { start, end } = monthBounds(billingMonth);
  const metrics = await getFinancialMetrics(billingMonth);

  const revenuePaise = metrics.operating.operatingRevenuePaise;
  // PG operational expenses are not tracked in a unified opex ledger yet.
  const expensePaise = 0;

  return {
    periodStart: start,
    periodEnd: end,
    billingMonth,
    revenuePaise,
    expensePaise,
    profitPaise: revenuePaise - expensePaise,
    revenueBreakdown: {
      rentPrincipalPaise: metrics.operating.rentPrincipalPaise,
      lateFeePaise: metrics.operating.lateFeePaise,
      electricityPaise: metrics.operating.electricityPaise,
      otherIncomePaise: metrics.operating.otherIncomePaise,
    },
  };
}
