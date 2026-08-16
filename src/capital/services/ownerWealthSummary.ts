/**
 * Owner-level Capital wealth summary for Owner OS integration.
 */
import { and, eq, gte, lte, sql, sum } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets, acExpenses } from '@/src/capital/db/schema';
import { getDealershipReportKpis } from '@/src/capital/services/analytics';
import { sumMyActiveInvestedCapitalPaise } from '@/src/capital/services/assets';
import { openInventorySql } from '@/src/capital/services/inventory';

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

export type CapitalOwnerWealthSummary = {
  periodStart: string;
  periodEnd: string;
  billingMonth: string;
  revenuePaise: number;
  expensePaise: number;
  profitPaise: number;
  portfolioValuePaise: number;
};

export async function getCapitalOwnerWealthSummary(opts?: {
  month?: string;
}): Promise<CapitalOwnerWealthSummary> {
  const billingMonth = resolveBillingMonth(opts?.month);
  const { start, end } = monthBounds(billingMonth);

  const [kpis, portfolioValuePaise] = await Promise.all([
    getDealershipReportKpis(),
    sumMyActiveInvestedCapitalPaise(),
  ]);

  const [expenseRow] = await capitalDb
    .select({ total: sum(acExpenses.amountPaise) })
    .from(acExpenses)
    .where(
      and(
        gte(acExpenses.expenseDate, start),
        lte(acExpenses.expenseDate, end),
        eq(acExpenses.isReversed, false),
      ),
    );

  const expensePaise = Number(expenseRow?.total ?? 0);
  const profitPaise = kpis.monthlyProfitPaise ?? 0;
  const revenuePaise = profitPaise + expensePaise;

  const [portfolioRow] = await capitalDb
    .select({
      total: sum(
        sql`COALESCE(${acAssets.currentInvestmentPaise}, ${acAssets.totalInvestmentPaise})`,
      ),
    })
    .from(acAssets)
    .where(openInventorySql());

  return {
    periodStart: start,
    periodEnd: end,
    billingMonth,
    revenuePaise,
    expensePaise,
    profitPaise,
    portfolioValuePaise: Number(portfolioRow?.total ?? portfolioValuePaise),
  };
}
