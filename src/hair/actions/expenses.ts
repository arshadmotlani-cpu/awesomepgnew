'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import {
  parseExpenseCategory,
  parseExpensePaymentMethod,
} from '@/src/hair/lib/expenseCategories';
import { createExpense, deleteExpense } from '@/src/hair/services/expenses';

export type ExpenseActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function createExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  try {
    await requirePermission('page:expenses');
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };

    const title = formStr(formData, 'title');
    if (!title) return { error: 'Title is required' };

    const expenseDate = formStr(formData, 'expenseDate');
    if (!expenseDate) return { error: 'Expense date is required' };

    const amountRupees = Number(formStr(formData, 'amountRupees'));
    if (!Number.isFinite(amountRupees) || amountRupees < 0) {
      return { error: 'Enter a valid amount' };
    }

    await createExpense({
      title,
      category: parseExpenseCategory(formStr(formData, 'category')),
      expenseDate,
      amountRupees,
      paymentMethod: parseExpensePaymentMethod(formStr(formData, 'paymentMethod')),
      attachmentUrl: formStr(formData, 'attachmentUrl') || null,
      notes: formStr(formData, 'notes') || null,
      staffName,
      staffEmployeeId: session?.workforceEmployeeId ?? null,
    });

    revalidatePath('/expenses');
    redirect('/expenses');
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to record expense' };
  }
}

export async function deleteExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  try {
    await requirePermission('page:expenses');
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing expense id' };
    await deleteExpense(id);
    revalidatePath('/expenses');
    return { success: 'Expense deleted.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to delete expense' };
  }
}
