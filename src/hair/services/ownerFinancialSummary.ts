/**
 * Owner-level FYH financial summary for Owner OS integration.
 */
import { and, gte, lte, sum } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhExpenses } from '@/src/hair/db/schema';
import { salonMonthStartUtc, zonedLocalToUtc } from '@/src/hair/lib/salonTime';
import { salesGrossPaiseExcludingAdvances } from '@/src/hair/services/revenueDashboardReport';
import { getSalonSettings } from '@/src/hair/services/settings';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

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

  const [expenseRow] = await hairDb
    .select({ total: sum(fyhExpenses.amountPaise) })
    .from(fyhExpenses)
    .where(
      and(
        orgFilter(fyhExpenses.organizationId, ctx),
        gte(fyhExpenses.expenseDate, start),
        lte(fyhExpenses.expenseDate, end),
      ),
    );

  const expensePaise = Number(expenseRow?.total ?? 0);

  return {
    periodStart: start,
    periodEnd: end,
    billingMonth,
    revenuePaise,
    expensePaise,
    profitPaise: revenuePaise - expensePaise,
  };
}
