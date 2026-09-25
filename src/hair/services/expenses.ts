import { and, desc, eq, ne, sql, type SQL } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhExpenses, type FyhExpense } from '@/src/hair/db/schema';
import type { FyhExpenseCategory, FyhExpensePaymentMethod } from '@/src/hair/lib/expenseCategories';
import {
  EXPENSE_FIELD_MAX,
  type FyhExpenseFor,
  type FyhExpensePaidBy,
  type FyhExpenseSource,
  parseExpenseFor,
  parseExpensePaidBy,
} from '@/src/hair/lib/expenseFields';
import { parseExpenseCategory, parseExpensePaymentMethod } from '@/src/hair/lib/expenseCategories';
import { orgFilter, locationFilter, tenantWriteDefaults } from '@/src/hair/lib/tenant/filters';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';
import {
  applyListFilters,
  generalExpenseBaseWhere,
  sumGeneralExpensesPaise,
  type ExpenseAggregationFilters,
} from '@/src/hair/services/expenseAggregation';

export const DEFAULT_EXPENSE_PAGE_SIZE = 25;
export const MAX_EXPENSE_PAGE_SIZE = 100;

export type ExpenseListFilters = ExpenseAggregationFilters & {
  page?: number;
  pageSize?: number;
  /** Include cancelled rows (audit); default false. */
  includeCancelled?: boolean;
};

export type ExpenseListResult = {
  rows: FyhExpense[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalGeneralPaise: number;
};

export type ManualExpenseInput = {
  title: string;
  category: FyhExpenseCategory;
  expenseDate: string;
  expenseFor: FyhExpenseFor;
  paidBy: FyhExpensePaidBy;
  amountRupees: number;
  paymentMethod: FyhExpensePaymentMethod;
  staffEmployeeId?: string | null;
  billNumber?: string | null;
  companyName?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  attachmentUrl?: string | null;
  attachmentContentType?: string | null;
  staffName: string;
  createdByEmployeeId?: string | null;
};

function clampPageSize(n?: number): number {
  const v = n ?? DEFAULT_EXPENSE_PAGE_SIZE;
  return Math.min(Math.max(v, 1), MAX_EXPENSE_PAGE_SIZE);
}

function generalListWhere(ctx: TenantContext | null, filters: ExpenseListFilters): SQL | undefined {
  const extra: SQL[] = applyListFilters(filters);
  if (!filters.includeCancelled) {
    extra.push(eq(fyhExpenses.status, 'active'));
  }
  extra.push(ne(fyhExpenses.category, 'salary'));
  const org = orgFilter(fyhExpenses.organizationId, ctx);
  const loc = locationFilter(fyhExpenses.locationId, ctx);
  const parts: SQL[] = [org, ...extra];
  if (loc) parts.push(loc);
  return and(...parts);
}

export function validateManualExpenseFields(input: ManualExpenseInput): void {
  const title = input.title.trim();
  if (!title) throw new Error('Title is required');
  if (title.length > EXPENSE_FIELD_MAX.title) throw new Error('Title is too long');

  if (input.category === 'salary') {
    throw new Error('Salary must be recorded through payroll, not general expenses');
  }

  if (!input.expenseDate) throw new Error('Expense date is required');

  if (!input.expenseFor) throw new Error('Expense for is required');
  if (!input.paidBy) throw new Error('Paid by is required');

  if (!Number.isFinite(input.amountRupees) || input.amountRupees <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  if (input.paidBy === 'staff') {
    if (!input.staffEmployeeId?.trim()) {
      throw new Error('Staff name is required when paid by staff');
    }
  } else if (input.staffEmployeeId) {
    throw new Error('Staff payer must be empty unless paid by staff');
  }

  const bill = input.billNumber?.trim();
  if (bill && bill.length > EXPENSE_FIELD_MAX.billNumber) throw new Error('Bill number is too long');
  const company = input.companyName?.trim();
  if (company && company.length > EXPENSE_FIELD_MAX.companyName) throw new Error('Company name is too long');
  const ref = input.referenceId?.trim();
  if (ref && ref.length > EXPENSE_FIELD_MAX.referenceId) throw new Error('Reference ID is too long');
  const notes = input.notes?.trim();
  if (notes && notes.length > EXPENSE_FIELD_MAX.notes) throw new Error('Notes are too long');
}

export async function listGeneralExpenses(
  filters: ExpenseListFilters = {},
  ctx?: TenantContext | null,
): Promise<ExpenseListResult> {
  ctx = await resolveTenantContextForService(ctx);
  const pageSize = clampPageSize(filters.pageSize);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const where = generalListWhere(ctx, filters);

  const [countRow] = await hairDb
    .select({ count: sql<number>`count(*)::int` })
    .from(fyhExpenses)
    .where(where);

  const totalCount = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const rows = await hairDb
    .select()
    .from(fyhExpenses)
    .where(where)
    .orderBy(desc(fyhExpenses.expenseDate), desc(fyhExpenses.createdAt))
    .limit(pageSize)
    .offset(offset);

  const totalGeneralPaise = await sumGeneralExpensesPaise(ctx, 'all', filters);

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages,
    totalGeneralPaise,
  };
}

/** @deprecated Use listGeneralExpenses — kept for transitional imports. */
export async function listExpenses(limit = 200, ctx?: TenantContext | null) {
  const result = await listGeneralExpenses({ pageSize: limit, page: 1 }, ctx);
  return result.rows;
}

export async function getGeneralExpenseById(id: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .select()
    .from(fyhExpenses)
    .where(
      and(
        orgFilter(fyhExpenses.organizationId, ctx),
        locationFilter(fyhExpenses.locationId, ctx),
        eq(fyhExpenses.id, id),
        ne(fyhExpenses.category, 'salary'),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createManualExpense(input: ManualExpenseInput, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  validateManualExpenseFields(input);

  const [row] = await hairDb
    .insert(fyhExpenses)
    .values({
      ...tenantWriteDefaults(ctx),
      title: input.title.trim(),
      category: input.category,
      expenseDate: input.expenseDate,
      expenseFor: input.expenseFor,
      paidBy: input.paidBy,
      amountPaise: Math.round(input.amountRupees * 100),
      paymentMethod: input.paymentMethod,
      billNumber: input.billNumber?.trim() || null,
      companyName: input.companyName?.trim() || null,
      referenceId: input.referenceId?.trim() || null,
      attachmentUrl: input.attachmentUrl ?? null,
      attachmentContentType: input.attachmentContentType ?? null,
      notes: input.notes?.trim() || null,
      staffName: input.staffName.trim(),
      staffEmployeeId: input.paidBy === 'staff' ? input.staffEmployeeId ?? null : null,
      source: 'manual',
      status: 'active',
      createdByEmployeeId: input.createdByEmployeeId ?? null,
      updatedByEmployeeId: input.createdByEmployeeId ?? null,
    })
    .returning();
  return row!;
}

/** @deprecated Use createManualExpense */
export async function createExpense(input: Omit<ManualExpenseInput, 'expenseFor' | 'paidBy'> & {
  expenseFor?: FyhExpenseFor;
  paidBy?: FyhExpensePaidBy;
}, ctx?: TenantContext | null) {
  return createManualExpense({
    ...input,
    expenseFor: input.expenseFor ?? 'organization',
    paidBy: input.paidBy ?? 'business_cash',
  }, ctx);
}

export async function updateManualExpense(
  id: string,
  input: ManualExpenseInput,
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  validateManualExpenseFields(input);

  const existing = await getGeneralExpenseById(id, ctx);
  if (!existing) throw new Error('Expense not found');
  if (existing.source === 'purchase' || existing.purchaseId) {
    throw new Error('Purchase-generated expenses must be edited from Purchases');
  }
  if (existing.status === 'cancelled') throw new Error('Cannot edit a cancelled expense');

  const [row] = await hairDb
    .update(fyhExpenses)
    .set({
      title: input.title.trim(),
      category: input.category,
      expenseDate: input.expenseDate,
      expenseFor: input.expenseFor,
      paidBy: input.paidBy,
      amountPaise: Math.round(input.amountRupees * 100),
      paymentMethod: input.paymentMethod,
      billNumber: input.billNumber?.trim() || null,
      companyName: input.companyName?.trim() || null,
      referenceId: input.referenceId?.trim() || null,
      attachmentUrl: input.attachmentUrl ?? existing.attachmentUrl,
      attachmentContentType: input.attachmentContentType ?? existing.attachmentContentType,
      notes: input.notes?.trim() || null,
      staffName: input.staffName.trim(),
      staffEmployeeId: input.paidBy === 'staff' ? input.staffEmployeeId ?? null : null,
      updatedByEmployeeId: input.createdByEmployeeId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        orgFilter(fyhExpenses.organizationId, ctx),
        locationFilter(fyhExpenses.locationId, ctx),
        eq(fyhExpenses.id, id),
      ),
    )
    .returning();
  if (!row) throw new Error('Expense not found');
  return row;
}

export async function cancelManualExpense(
  id: string,
  opts: { reason?: string | null; cancelledByEmployeeId?: string | null },
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const existing = await getGeneralExpenseById(id, ctx);
  if (!existing) throw new Error('Expense not found');
  if (existing.source === 'purchase' || existing.purchaseId) {
    throw new Error('Purchase-generated expenses cannot be cancelled here');
  }
  if (existing.status === 'cancelled') return existing;

  const reason = opts.reason?.trim() || null;
  if (reason && reason.length > 500) throw new Error('Cancellation reason is too long');

  const [row] = await hairDb
    .update(fyhExpenses)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledByEmployeeId: opts.cancelledByEmployeeId ?? null,
      cancellationReason: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        orgFilter(fyhExpenses.organizationId, ctx),
        locationFilter(fyhExpenses.locationId, ctx),
        eq(fyhExpenses.id, id),
      ),
    )
    .returning();
  if (!row) throw new Error('Expense not found');
  return row;
}

/** @deprecated Use cancelManualExpense */
export async function deleteExpense(id: string, ctx?: TenantContext | null) {
  return cancelManualExpense(id, {}, ctx);
}

export function parseExpenseListFiltersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): ExpenseListFilters {
  const pick = (key: string) => {
    const v = params[key];
    return typeof v === 'string' ? v.trim() : '';
  };
  const page = Number.parseInt(pick('page'), 10);
  const pageSize = Number.parseInt(pick('pageSize'), 10);
  const category = parseExpenseCategory(pick('category'));
  const expenseFor = parseExpenseFor(pick('expenseFor'));
  const paidBy = parseExpensePaidBy(pick('paidBy'));
  const paymentMethod = parseExpensePaymentMethod(pick('paymentMethod'));
  const sourceRaw = pick('source');
  const source =
    sourceRaw === 'manual' || sourceRaw === 'purchase' ? (sourceRaw as FyhExpenseSource) : undefined;

  return {
    search: pick('q') || undefined,
    fromDay: pick('from') || undefined,
    toDay: pick('to') || undefined,
    category: category ?? undefined,
    expenseFor: expenseFor ?? undefined,
    paidBy: paidBy ?? undefined,
    paymentMethod: paymentMethod ?? undefined,
    staffEmployeeId: pick('staff') || undefined,
    source,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : DEFAULT_EXPENSE_PAGE_SIZE,
  };
}
