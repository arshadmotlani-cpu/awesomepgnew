'use server';

import { revalidatePath } from 'next/cache';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireFyhPermission } from '@/src/workforce/permissions/guards';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';
import {
  parseExpenseCategory,
  parseExpensePaymentMethod,
} from '@/src/hair/lib/expenseCategories';
import { parseExpenseFor, parseExpensePaidBy } from '@/src/hair/lib/expenseFields';
import { uploadExpenseAttachment } from '@/src/hair/lib/expenseAttachmentUpload';
import {
  cancelManualExpense,
  createManualExpense,
  updateManualExpense,
} from '@/src/hair/services/expenses';

export type ExpenseActionState = { error?: string; success?: string; fieldErrors?: Record<string, string> };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function parseManualFromForm(formData: FormData, staffName: string, employeeId: string | null) {
  const title = formStr(formData, 'title');
  const categoryRaw = formStr(formData, 'category');
  const expenseDate = formStr(formData, 'expenseDate');
  const expenseForRaw = formStr(formData, 'expenseFor');
  const paidByRaw = formStr(formData, 'paidBy');
  const amountRupees = Number(formStr(formData, 'amountRupees'));
  const paymentMethodRaw = formStr(formData, 'paymentMethod');
  const staffEmployeeIdRaw = formStr(formData, 'staffEmployeeId');

  const category = parseExpenseCategory(categoryRaw);
  const expenseFor = parseExpenseFor(expenseForRaw);
  const paidBy = parseExpensePaidBy(paidByRaw);
  const paymentMethod = parseExpensePaymentMethod(paymentMethodRaw);

  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = 'Title is required';
  if (!category) fieldErrors.category = 'Category is required';
  if (!expenseDate) fieldErrors.expenseDate = 'Expense date is required';
  if (!expenseFor) fieldErrors.expenseFor = 'Expense for is required';
  if (!paidBy) fieldErrors.paidBy = 'Paid by is required';
  if (!paymentMethod) fieldErrors.paymentMethod = 'Payment mode is required';
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
    fieldErrors.amountRupees = 'Amount must be greater than zero';
  }
  if (paidBy === 'staff' && !staffEmployeeIdRaw) {
    fieldErrors.staffEmployeeId = 'Select staff when paid by staff';
  }

  if (Object.keys(fieldErrors).length) {
    return { fieldErrors, input: null };
  }

  return {
    fieldErrors: null,
    input: {
      title,
      category: category!,
      expenseDate,
      expenseFor: expenseFor!,
      paidBy: paidBy!,
      amountRupees,
      paymentMethod: paymentMethod!,
      billNumber: formStr(formData, 'billNumber') || null,
      companyName: formStr(formData, 'companyName') || null,
      referenceId: formStr(formData, 'referenceId') || null,
      notes: formStr(formData, 'notes') || null,
      staffName,
      staffEmployeeId: paidBy === 'staff' ? staffEmployeeIdRaw : null,
      createdByEmployeeId: employeeId,
      attachmentUrl: null as string | null,
      attachmentContentType: null as string | null,
    },
  };
}

async function attachIfPresent(
  formData: FormData,
  expenseId: string,
  input: { attachmentUrl: string | null; attachmentContentType: string | null },
) {
  const file = formData.get('attachment');
  if (!(file instanceof File) || file.size === 0) return input;
  const uploaded = await uploadExpenseAttachment(file, expenseId);
  return {
    attachmentUrl: uploaded.url,
    attachmentContentType: uploaded.contentType,
  };
}

export async function createExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  try {
    await requireFyhPermission({ permission: 'expenses.general.add', scope: 'org' });
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };
    const ctx = await getTenantContextForAction();
    const employeeId = session?.workforceEmployeeId ?? null;

    const parsed = parseManualFromForm(formData, staffName, employeeId);
    if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
    if (!parsed.input) return { error: 'Invalid expense' };

    const row = await createManualExpense(parsed.input, ctx);
    const attachment = await attachIfPresent(formData, row.id, parsed.input);
    if (attachment.attachmentUrl) {
      await updateManualExpense(row.id, { ...parsed.input, ...attachment }, ctx);
    }

    revalidatePath('/expenses');
    return { success: 'Expense recorded.' };
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to record expense' };
  }
}

export async function updateExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  try {
    await requireFyhPermission({ permission: 'expenses.general.edit', scope: 'org' });
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing expense id' };
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };
    const ctx = await getTenantContextForAction();
    const employeeId = session?.workforceEmployeeId ?? null;

    const parsed = parseManualFromForm(formData, staffName, employeeId);
    if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
    if (!parsed.input) return { error: 'Invalid expense' };

    let input = parsed.input;
    const attachment = await attachIfPresent(formData, id, input);
    input = { ...input, ...attachment };

    await updateManualExpense(id, input, ctx);
    revalidatePath('/expenses');
    return { success: 'Expense updated.' };
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to update expense' };
  }
}

export async function cancelExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  try {
    await requireFyhPermission({ permission: 'expenses.general.edit', scope: 'org' });
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing expense id' };
    const ctx = await getTenantContextForAction();
    const session = await getHairSession();
    await cancelManualExpense(
      id,
      {
        reason: formStr(formData, 'reason') || null,
        cancelledByEmployeeId: session?.workforceEmployeeId ?? null,
      },
      ctx,
    );
    revalidatePath('/expenses');
    return { success: 'Expense cancelled.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to cancel expense' };
  }
}

/** @deprecated Use cancelExpenseAction */
export async function deleteExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  return cancelExpenseAction(_prev, formData);
}
