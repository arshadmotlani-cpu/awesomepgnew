/**
 * Owner-level FYH financial summary for Owner OS integration.
 */
import { salonMonthStartUtc, zonedLocalToUtc } from '@/src/hair/lib/salonTime';
import { salesGrossPaiseExcludingAdvances } from '@/src/hair/services/revenueDashboardReport';
import { sumGeneralExpensesPaise } from '@/src/hair/services/expenseAggregation';
import { getSalonSettings } from '@/src/hair/services/settings';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

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

export type FyhOwnerFinancialSummary = {
  periodStart: string;
  periodEnd: string;
  billingMonth: string;
  revenuePaise: number;
  expensePaise: number;
  profitPaise: number;
};

export async function getFyhOwnerFinancialSummary(
  opts?: {
    month?: string;
  },
  ctx?: TenantContext | null,
): Promise<FyhOwnerFinancialSummary> {
  const billingMonth = resolveBillingMonth(opts?.month);
  const { start, end } = monthBounds(billingMonth);

  const settings = await getSalonSettings(ctx);
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const monthStart = salonMonthStartUtc(timezone, new Date(`${billingMonth}-15T12:00:00Z`));
  const monthEndExclusive = new Date(zonedLocalToUtc(`${end}T00:00:00`, timezone).getTime() + 86_400_000);
  const revenuePaise = await salesGrossPaiseExcludingAdvances(monthStart, monthEndExclusive, ctx);

  const tenantCtx = await resolveTenantContextForService(ctx);
  const expensePaise = await sumGeneralExpensesPaise(
    tenantCtx,
    'all',
    { fromDay: start, toDay: end },
  );

  return {
    periodStart: start,
    periodEnd: end,
    billingMonth,
    revenuePaise,
    expensePaise,
    profitPaise: revenuePaise - expensePaise,
  };
}
