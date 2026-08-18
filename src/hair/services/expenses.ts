import { and, desc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhExpenses } from '@/src/hair/db/schema';
import type { FyhExpenseCategory, FyhExpensePaymentMethod } from '@/src/hair/lib/expenseCategories';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export type ExpenseInput = {
  title: string;
  category: FyhExpenseCategory;
  expenseDate: string;
  amountRupees: number;
  paymentMethod: FyhExpensePaymentMethod;
  attachmentUrl?: string | null;
  notes?: string | null;
  staffName: string;
  staffEmployeeId?: string | null;
};

export async function listExpenses(limit = 200, ctx?: TenantContext | null) {
  return hairDb
    .select()
    .from(fyhExpenses)
    .where(and(orgFilter(fyhExpenses.organizationId, ctx), locationFilter(fyhExpenses.locationId, ctx)))
    .orderBy(desc(fyhExpenses.expenseDate), desc(fyhExpenses.createdAt))
    .limit(limit);
}

export async function createExpense(input: ExpenseInput, ctx?: TenantContext | null) {
  const title = input.title.trim();
  if (!title) throw new Error('Title is required');
  if (input.amountRupees < 0) throw new Error('Amount cannot be negative');
  const [row] = await hairDb
    .insert(fyhExpenses)
    .values({
      ...tenantWriteDefaults(ctx),
      title,
      category: input.category,
      expenseDate: input.expenseDate,
      amountPaise: Math.round(input.amountRupees * 100),
      paymentMethod: input.paymentMethod,
      attachmentUrl: input.attachmentUrl ?? null,
      notes: input.notes?.trim() || null,
      staffName: input.staffName.trim(),
      staffEmployeeId: input.staffEmployeeId ?? null,
    })
    .returning();
  return row!;
}

export async function deleteExpense(id: string, ctx?: TenantContext | null) {
  await hairDb
    .delete(fyhExpenses)
    .where(
      and(
        orgFilter(fyhExpenses.organizationId, ctx),
        locationFilter(fyhExpenses.locationId, ctx),
        eq(fyhExpenses.id, id),
      ),
    );
}
