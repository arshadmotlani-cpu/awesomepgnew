'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { rupeesToPaise } from '@/src/capital/lib/money';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';
import { createExpenseSchema, reverseSchema } from '@/src/capital/lib/validation/schemas';
import { createExpense, reverseExpense } from '@/src/capital/services/expenses';

export type ActionState = { error?: string; success?: string };

export async function createExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(createExpenseSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    const input = parsed.data;
    await createExpense({
      assetId: input.assetId,
      categoryId: input.categoryId,
      expenseDate: input.expenseDate,
      amountPaise: rupeesToPaise(input.amount),
      description: input.description,
      vendor: input.vendor,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
    });
    revalidatePath('/expenses');
    revalidatePath(`/assets/${input.assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Expense created.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create expense' };
  }
}

export async function reverseExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(reverseSchema, {
      id: formData.get('expenseId') ?? formData.get('id'),
      reason: formData.get('reason'),
    });
    if (!parsed.ok) return { error: parsed.error };

    await reverseExpense(parsed.data.id, parsed.data.reason);
    revalidatePath('/expenses');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Expense reversed.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reverse expense' };
  }
}
