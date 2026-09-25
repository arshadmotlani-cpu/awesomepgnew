/**
 * Authoritative general-expense aggregation (excludes payroll / legacy salary category).
 */

import { and, eq, gte, ne, sql, type SQL } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhExpenses } from '@/src/hair/db/schema';
import type { FyhExpenseCategory, FyhExpensePaymentMethod } from '@/src/hair/lib/expenseCategories';
import { FYH_EXPENSE_CATEGORY_LABELS } from '@/src/hair/lib/expenseCategories';
import type { RevenueDashboardLocationFilter } from '@/src/hair/services/revenueDashboardReportTypes';
import { salonDayBounds } from '@/src/hair/lib/salonTime';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationsInFilter } from '@/src/hair/lib/tenant/filters';
import type { FyhExpenseFor, FyhExpensePaidBy, FyhExpenseSource } from '@/src/hair/lib/expenseFields';

export type ExpenseAggregationFilters = {
  fromDay?: string;
  toDay?: string;
  category?: FyhExpenseCategory;
  expenseFor?: FyhExpenseFor;
  paidBy?: FyhExpensePaidBy;
  paymentMethod?: FyhExpensePaymentMethod;
  staffEmployeeId?: string;
  source?: FyhExpenseSource;
  search?: string;
};

export function applyListFilters(filters: ExpenseAggregationFilters): SQL[] {
  const parts: SQL[] = [];
  if (filters.fromDay) parts.push(gte(fyhExpenses.expenseDate, filters.fromDay));
  if (filters.toDay) parts.push(sql`${fyhExpenses.expenseDate} <= ${filters.toDay}`);
  if (filters.category) parts.push(eq(fyhExpenses.category, filters.category));
  if (filters.expenseFor) parts.push(eq(fyhExpenses.expenseFor, filters.expenseFor));
  if (filters.paidBy) parts.push(eq(fyhExpenses.paidBy, filters.paidBy));
  if (filters.paymentMethod) parts.push(eq(fyhExpenses.paymentMethod, filters.paymentMethod));
  if (filters.staffEmployeeId) parts.push(eq(fyhExpenses.staffEmployeeId, filters.staffEmployeeId));
  if (filters.source) parts.push(eq(fyhExpenses.source, filters.source));
  const q = filters.search?.trim();
  if (q) {
    const pattern = `%${q.replace(/%/g, '\\%')}%`;
    parts.push(
      sql`(
        ${fyhExpenses.title} ilike ${pattern}
        or coalesce(${fyhExpenses.companyName}, '') ilike ${pattern}
        or coalesce(${fyhExpenses.billNumber}, '') ilike ${pattern}
        or coalesce(${fyhExpenses.referenceId}, '') ilike ${pattern}
      )`,
    );
  }
  return parts;
}

export function generalExpenseBaseWhere(
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter = 'all',
  extra?: SQL[],
): SQL | undefined {
  const parts: SQL[] = [
    eq(fyhExpenses.status, 'active'),
    ne(fyhExpenses.category, 'salary'),
    ...(extra ?? []),
  ];
  const org = orgFilter(fyhExpenses.organizationId, ctx);
  if (org) parts.unshift(org);
  const loc = locationsInFilter(fyhExpenses.locationId, ctx, locationIds);
  if (loc) parts.push(loc);
  return and(...parts);
}

export async function sumGeneralExpensesPaise(
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
  filters: ExpenseAggregationFilters = {},
): Promise<number> {
  const where = generalExpenseBaseWhere(ctx, locationIds, applyListFilters(filters));
  const [row] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhExpenses.amountPaise}), 0)::bigint`,
    })
    .from(fyhExpenses)
    .where(where);
  return Number(row?.total ?? 0);
}

export async function aggregateGeneralExpensesByCategory(
  from: Date,
  to: Date,
  timezone: string,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
) {
  const fromDay = salonDayBounds(timezone, from).dayKey;
  const toDay = salonDayBounds(timezone, new Date(to.getTime() - 1)).dayKey;

  const rows = await hairDb
    .select({
      category: fyhExpenses.category,
      total: sql<number>`coalesce(sum(${fyhExpenses.amountPaise}), 0)::bigint`,
    })
    .from(fyhExpenses)
    .where(
      generalExpenseBaseWhere(ctx, locationIds, [
        gte(fyhExpenses.expenseDate, fromDay),
        sql`${fyhExpenses.expenseDate} <= ${toDay}`,
      ]),
    )
    .groupBy(fyhExpenses.category);

  const out = rows.map((r) => {
    const category = r.category as FyhExpenseCategory;
    return {
      category,
      label: FYH_EXPENSE_CATEGORY_LABELS[category] ?? category,
      amountPaise: Number(r.total ?? 0),
      isLegacySalaryCategory: category === 'salary',
    };
  });
  out.sort((a, b) => b.amountPaise - a.amountPaise);
  const expensesTotalPaise = out.reduce((s, r) => s + r.amountPaise, 0);
  return { rows: out.filter((r) => r.category !== 'salary'), expensesTotalPaise };
}

export async function sumLegacySalaryCategoryExpensesPaise(
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
  fromDay: string,
  toDay: string,
): Promise<number> {
  const parts: SQL[] = [
    eq(fyhExpenses.status, 'active'),
    eq(fyhExpenses.category, 'salary'),
    gte(fyhExpenses.expenseDate, fromDay),
    sql`${fyhExpenses.expenseDate} <= ${toDay}`,
  ];
  const org = orgFilter(fyhExpenses.organizationId, ctx);
  if (org) parts.unshift(org);
  const loc = locationsInFilter(fyhExpenses.locationId, ctx, locationIds);
  if (loc) parts.push(loc);
  const where = and(...parts);
  const [row] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhExpenses.amountPaise}), 0)::bigint`,
    })
    .from(fyhExpenses)
    .where(where);
  return Number(row?.total ?? 0);
}
